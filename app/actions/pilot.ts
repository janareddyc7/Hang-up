"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { drills, pilotAssessments, pilotParticipants } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { personas } from "@/lib/personas";
import { pilotConfig, pilotProgress } from "@/lib/pilot/server";
import { phaseAvailable, PilotPhaseSchema, surveyTotal } from "@/lib/pilot/protocol";

type Result = { ok: true } | { ok: false; error: string };
const unavailable = { ok: false as const, error: "Pilot enrollment is unavailable until the instrument and adult review are complete." };

export async function enrollPilot(input: unknown): Promise<Result> {
  const config = pilotConfig();
  if (!config) return unavailable;
  const parsed = z.object({ consent: z.literal(true), consentVersion: z.literal(config.consentVersion) }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, error: "Read the consent information and choose whether to take part." };
  const user = await requireUser();
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pilot:${user.id}`}))`);
      const [existing] = await tx.select().from(pilotParticipants).where(eq(pilotParticipants.userId, user.id)).limit(1);
      if (existing) throw new Error("already enrolled");
      const history = await tx.select({ personaId: drills.personaId }).from(drills).where(eq(drills.userId, user.id));
      const seen = new Set(history.map((d) => d.personaId));
      const candidates = personas.filter((p) => !seen.has(p.id));
      const holdout = candidates[crypto.getRandomValues(new Uint32Array(1))[0]! % candidates.length];
      if (!holdout) throw new Error("no unpracticed holdout");
      await tx.insert(pilotParticipants).values({ userId: user.id, participantId: crypto.randomUUID(), holdoutPersonaId: holdout.id, consentVersion: config.consentVersion });
    });
    revalidatePath("/pilot"); revalidatePath("/practice");
    return { ok: true };
  } catch { return { ok: false, error: "Enrollment could not be completed. You may already be enrolled, or have practiced every available holdout scenario." }; }
}

export async function submitPilotSurvey(input: unknown): Promise<Result> {
  const config = pilotConfig();
  if (!config) return unavailable;
  const parsed = z.object({ phase: PilotPhaseSchema, answers: z.array(z.number().int().min(config.minimum).max(config.maximum)).length(5) }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, error: "Answer all five survey items." };
  const user = await requireUser();
  try {
    const progress = await pilotProgress(user.id);
    if (!progress || progress.participant.withdrawnAt || !phaseAvailable(parsed.data.phase, progress.completed, progress.dueAt(parsed.data.phase), Date.now())) {
      return { ok: false, error: "This survey is not due yet, or the previous assessment is unfinished." };
    }
    await db.transaction(async (tx) => {
      // Serialize with withdrawal so no new response can be saved after consent ends.
      const [active] = await tx.select().from(pilotParticipants).where(and(eq(pilotParticipants.userId, user.id), isNull(pilotParticipants.withdrawnAt))).for("update").limit(1);
      if (!active) throw new Error("consent withdrawn");
      await tx.insert(pilotAssessments).values({ userId: user.id, phase: parsed.data.phase, answers: parsed.data.answers, surveyTotal: surveyTotal(config, parsed.data.answers) }).onConflictDoNothing();
    });
    revalidatePath("/pilot"); return { ok: true };
  } catch { return { ok: false, error: "The survey could not be saved. Please try again." }; }
}

export async function withdrawPilot(): Promise<Result> {
  const user = await requireUser();
  try {
    await db.transaction(async (tx) => {
      await tx.update(pilotParticipants).set({ withdrawnAt: new Date() }).where(eq(pilotParticipants.userId, user.id));
      await tx.delete(pilotAssessments).where(eq(pilotAssessments.userId, user.id));
    });
    revalidatePath("/pilot"); revalidatePath("/practice");
    return { ok: true };
  } catch { return { ok: false, error: "The request could not be saved. Please try again." }; }
}
