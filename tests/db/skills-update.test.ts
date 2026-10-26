import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleDrillStore } from "../../src/lib/drill/drizzle-store";
import { createDrill, finishDrill } from "../../src/lib/drill/runtime";
import * as schema from "../../src/db/schema";
import { personas as sourcePersonas } from "../helpers";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const database = pool ? drizzle(pool, { schema }) : null;

suite("finishDrill learning updates (TEST_DATABASE_URL)", () => {
  const userId = `skills-${crypto.randomUUID()}`;
  const email = `${userId}@example.test`;
  const personaId = `skills-test-${crypto.randomUUID()}`;
  const sourcePersona = sourcePersonas.get("tech-support")!;
  const persona = { ...sourcePersona, id: personaId };
  const personas = new Map([[personaId, persona]]);
  const store = database ? new DrizzleDrillStore(database) : null;
  const deps = {
    store: store!,
    personas,
    now: () => Date.UTC(2026, 0, 1),
    newId: () => `learning-${crypto.randomUUID()}`,
  };

  beforeAll(async () => {
    await database!.insert(schema.user).values({ id: userId, name: "Skills test", email, emailVerified: true });
  });

  afterAll(async () => {
    if (!database) return;
    await database.delete(schema.user).where(eq(schema.user.id, userId));
    await database.delete(schema.itemDifficulty).where(eq(schema.itemDifficulty.personaId, personaId));
    await pool?.end();
  });

  it("updates signed-in skill and item difficulty once per completed drill", async () => {
    const failed = await createDrill(deps, { personaId, difficulty: "realistic", userId, mode: "sparring", seed: "same-opening" });
    const exposure = failed.record.turns[0]!;
    if (exposure.speaker !== "scammer") throw new Error("expected the opening caller line");
    const tactic = exposure.tactics[0]!;
    await store!.save({
      ...failed.record,
      version: 2,
      turns: [...failed.record.turns, {
        speaker: "user",
        afterK: exposure.k,
        text: "[practice number]",
        move: "share_code",
        confidence: 1,
        decidedBy: "rule",
        tMs: 1_000,
      }],
    });

    await finishDrill(deps, failed.drillId);
    const [afterFailure] = await database!.select().from(schema.skills)
      .where(eq(schema.skills.userId, userId));
    const [itemAfterFailure] = await database!.select().from(schema.itemDifficulty)
      .where(eq(schema.itemDifficulty.personaId, personaId));
    expect(afterFailure).toMatchObject({ tactic, theta: 984, box: 0, lastPersonaId: personaId, exposures: 1 });
    expect(afterFailure?.dueAt.getTime()).toBe(Date.UTC(2026, 0, 2));
    expect(itemAfterFailure).toMatchObject({ tactic, difficulty: "realistic", d: 1008, n: 1 });

    await finishDrill(deps, failed.drillId);
    const [afterRepeatedFinish] = await database!.select().from(schema.skills)
      .where(eq(schema.skills.userId, userId));
    expect(afterRepeatedFinish).toEqual(afterFailure);

    const succeeded = await createDrill(deps, { personaId, difficulty: "realistic", userId, mode: "sparring", seed: "same-opening" });
    await finishDrill(deps, succeeded.drillId);
    const [afterSuccess] = await database!.select().from(schema.skills)
      .where(eq(schema.skills.userId, userId));
    const [itemAfterSuccess] = await database!.select().from(schema.itemDifficulty)
      .where(eq(schema.itemDifficulty.personaId, personaId));
    expect(afterSuccess?.theta).toBeGreaterThan(afterFailure!.theta);
    expect(afterSuccess?.box).toBe(1);
    expect(afterSuccess?.exposures).toBe(2);
    expect(itemAfterSuccess?.n).toBe(2);
    expect(itemAfterSuccess!.d).toBeLessThan(itemAfterFailure!.d);
  });

  it("scores a pilot assessment without updating learning or item difficulty", async () => {
    const before = await database!.select().from(schema.skills).where(eq(schema.skills.userId, userId));
    const assessment = await createDrill(deps, { personaId, difficulty: "realistic", userId, mode: "sparring", isAssessment: true });
    await finishDrill(deps, assessment.drillId);
    expect((await store!.get(assessment.drillId))?.score).toBeTruthy();
    expect(await database!.select().from(schema.skills).where(eq(schema.skills.userId, userId))).toEqual(before);
  });
});
