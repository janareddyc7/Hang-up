import { createHash } from "node:crypto";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env", override: false });

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const coachEmail = readArg("coach-email")?.trim().toLowerCase();
  const apply = process.argv.includes("--apply");
  if (!coachEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(coachEmail)) {
    console.log("Usage: pnpm seed:demo --coach-email you@example.com [--apply]");
    process.exitCode = 1;
    return;
  }
  if (!apply) {
    console.log(`Dry run: would add a clearly labeled synthetic trainee and three fictional practice drills to ${coachEmail}'s Family Circle.`);
    console.log("Review the plan, set DEMO_SEED_ENABLED=true, then add --apply to write to the configured database.");
    return;
  }
  if (process.env.DEMO_SEED_ENABLED !== "true") {
    console.error("Demo seed is disabled. Set DEMO_SEED_ENABLED=true before using --apply.");
    process.exitCode = 1;
    return;
  }

  const [{ db }, { circles, circleMembers, drills, profiles, user }, { eq }, { DrizzleDrillStore }, { personas }, { createDrill, runTurn, finishDrill }, { PLACEMENT_SCENARIOS }] = await Promise.all([
    import("../src/db/client"),
    import("../src/db/schema"),
    import("drizzle-orm"),
    import("../src/lib/drill/drizzle-store"),
    import("../src/lib/personas"),
    import("../src/lib/drill/runtime"),
    import("../src/lib/practice/recommend"),
  ]);
  const [coach] = await db.select().from(user).where(eq(user.email, coachEmail)).limit(1);
  if (!coach) {
    console.error("No signed-in coach account matches that email. Sign in to the app first; the seed will not create a fake coach login.");
    process.exitCode = 1;
    return;
  }

  const key = createHash("sha256").update(coach.id).digest("hex").slice(0, 20);
  const traineeId = `demo_trainee_${key}`;
  const traineeEmail = `demo.trainee.${key}@example.invalid`;
  const circleId = `demo_circle_${key}`;
  const now = new Date();
  const [existingCircle] = await db.select({ createdBy: circles.createdBy, name: circles.name }).from(circles).where(eq(circles.id, circleId)).limit(1);
  if (existingCircle && (existingCircle.createdBy !== coach.id || !existingCircle.name.startsWith("Demo family circle"))) {
    throw new Error("The deterministic demo circle ID is already used by a different circle.");
  }
  await db.transaction(async (tx) => {
    await tx.insert(user).values({
      id: traineeId,
      name: "Demo trainee — synthetic data",
      email: traineeEmail,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
    const [existingTrainee] = await tx.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.id, traineeId)).limit(1);
    if (!existingTrainee || existingTrainee.email !== traineeEmail || !existingTrainee.name.startsWith("Demo trainee")) {
      throw new Error("The deterministic demo account ID is already used by a different account.");
    }
    await tx.insert(profiles).values({ userId: traineeId, displayName: "Demo trainee — synthetic data" }).onConflictDoNothing();
    await tx.insert(circles).values({ id: circleId, name: "Demo family circle (synthetic) — not real participant data", createdBy: coach.id }).onConflictDoNothing();
    await tx.insert(circleMembers).values([
      { circleId, userId: coach.id, role: "coach" },
      { circleId, userId: traineeId, role: "trainee", shareTranscripts: false },
    ]).onConflictDoNothing();
  });

  const store = new DrizzleDrillStore(db);
  const runtimeDeps = {
    store,
    personas: new Map(personas.map((persona) => [persona.id, persona] as const)),
    actorModel: {} as import("ai").LanguageModel,
    classifierModel: {} as import("ai").LanguageModel,
    llmSecret: "seed-script-does-not-call-the-llm",
    now: () => Date.now(),
    newId: () => `drl_${crypto.randomUUID()}`,
  };
  const existingDrills = await db.select({ id: drills.id }).from(drills).where(eq(drills.userId, traineeId));
  for (const personaId of PLACEMENT_SCENARIOS.slice(existingDrills.length, 3)) {
    const persona = runtimeDeps.personas.get(personaId);
    if (!persona) continue;
    const created = await createDrill(runtimeDeps, { personaId, difficulty: "easy", userId: traineeId, mode: "sparring" });
    try {
      await runTurn(runtimeDeps, {
        drillId: created.drillId,
        userText: "I will call the bank myself using a number I already trust.",
        sessionUserId: traineeId,
      });
      await finishDrill(runtimeDeps, created.drillId);
    } catch (error) {
      await db.delete(drills).where(eq(drills.id, created.drillId));
      throw error;
    }
  }

  console.log("Seeded the Family Circle with one clearly labeled synthetic trainee and up to three scripted, fictional drills.");
  console.log("No sign-in account was created for the demo trainee; transcript sharing remains off. Remove the demo circle and trainee before public launch if they are no longer needed.");
}

void main().catch(() => {
  console.error("Demo seed failed. Check database connectivity and schema migrations; no secret values were printed.");
  process.exitCode = 1;
});
