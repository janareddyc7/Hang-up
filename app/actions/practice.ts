"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { drills, itemDifficulty as itemDifficultyTable, skills } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getRuntimeDeps } from "@/lib/drill/deps";
import { DIFFICULTY_BASE, type ItemDifficulty, type SkillRow } from "@/lib/engine/skills";
import { TacticSchema } from "@/lib/engine/schema";
import { recommendPractice } from "@/lib/practice/recommend";
import { pilotHoldout } from "@/lib/pilot/server";

export async function nextDrill() {
  const currentUser = await requireUser();
  const [skillRows, finished, itemRows, holdout] = await Promise.all([
    db.select().from(skills).where(eq(skills.userId, currentUser.id)),
    db.select({ id: drills.id }).from(drills).where(and(eq(drills.userId, currentUser.id), eq(drills.status, "ended"), eq(drills.isAssessment, false))),
    db.select().from(itemDifficultyTable),
    pilotHoldout(currentUser.id),
  ]);
  const skillList: SkillRow[] = skillRows.flatMap((row) => {
    const tactic = TacticSchema.safeParse(row.tactic);
    return tactic.success ? [{ tactic: tactic.data, theta: row.theta, box: row.box, dueAtMs: row.dueAt.getTime(), ...(row.lastPersonaId ? { lastPersonaId: row.lastPersonaId } : {}) }] : [];
  });
  const itemMap = new Map(itemRows.map((row) => [`${row.personaId}:${row.tactic}:${row.difficulty}`, row.d] as const));
  const itemDifficulty: ItemDifficulty = (personaId, tactic, difficulty) =>
    itemMap.get(`${personaId}:${tactic}:${difficulty}`) ?? DIFFICULTY_BASE[difficulty];
  const choice = recommendPractice({
    completedDrills: finished.length,
    personas: [...getRuntimeDeps().personas.values()],
    skills: skillList,
    nowMs: Date.now(),
    itemDifficulty,
    excludedPersonaIds: holdout ? new Set([holdout]) : undefined,
  });
  return { ok: true as const, choice };
}
