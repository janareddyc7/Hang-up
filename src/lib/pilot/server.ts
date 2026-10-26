import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { drills, pilotAssessments, pilotParticipants } from "@/db/schema";
import { env } from "@/env";
import rawConfig from "../../../content/pilot.json";
import { PilotConfigSchema, pilotDueAt, phaseAvailable, type PilotPhase } from "./protocol";

export function pilotConfig() {
  if (!env.PILOT_ENABLED) return null;
  const result = PilotConfigSchema.safeParse(rawConfig);
  return result.success ? result.data : null;
}

export async function pilotProgress(userId: string) {
  const [participant] = await db.select().from(pilotParticipants).where(eq(pilotParticipants.userId, userId)).limit(1);
  if (!participant) return null;
  const rows = await db.select({ phase: pilotAssessments.phase, drillId: pilotAssessments.drillId, surveyTotal: pilotAssessments.surveyTotal, outcome: drills.outcome, score: drills.score, endedAt: drills.endedAt })
    .from(pilotAssessments).leftJoin(drills, eq(drills.id, pilotAssessments.drillId)).where(eq(pilotAssessments.userId, userId));
  const completed = new Set(rows.filter((r) => r.outcome !== null).map((r) => r.phase as PilotPhase));
  const post = rows.find((r) => r.phase === "post" && r.outcome !== null);
  return { participant, rows, completed, nowMs: Date.now(), dueAt: (phase: PilotPhase) => pilotDueAt(phase, participant.consentAt.getTime(), post?.endedAt?.getTime()) };
}

export async function pilotHoldout(userId: string): Promise<string | null> {
  if (!env.PILOT_ENABLED) return null;
  const [participant] = await db.select({ personaId: pilotParticipants.holdoutPersonaId }).from(pilotParticipants)
    .where(and(eq(pilotParticipants.userId, userId), isNull(pilotParticipants.withdrawnAt))).limit(1);
  return participant?.personaId ?? null;
}

export async function authorizePilotCall(userId: string, phase: PilotPhase, personaId: string): Promise<boolean> {
  if (!pilotConfig()) return false;
  const progress = await pilotProgress(userId);
  if (!progress || progress.participant.withdrawnAt || progress.participant.holdoutPersonaId !== personaId) return false;
  const assessment = progress.rows.find((r) => r.phase === phase);
  return Boolean(assessment && !assessment.drillId && phaseAvailable(phase, progress.completed, progress.dueAt(phase), Date.now()));
}
