import { and, eq } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgTransaction } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { itemDifficulty, skills } from "@/db/schema";
import { DEFAULT_RATING, DIFFICULTY_BASE, dueAt, nextBox, updateElo } from "@/lib/engine/skills";
import type { Difficulty } from "@/lib/engine/schema";
import type { TacticOutcome } from "@/lib/engine/scoring";

type SkillsTransaction = NodePgTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

/**
 * Apply a scored drill to a trainee and the shared scenario calibration.
 * Rows are created first and then locked so parallel drills cannot overwrite
 * one another's Elo updates. Call only inside the drill-finalization transaction.
 */
export async function applyDrillToSkills(
  tx: SkillsTransaction,
  userId: string,
  personaId: string,
  difficulty: Difficulty,
  tacticOutcomes: readonly TacticOutcome[],
  now: Date,
): Promise<void> {
  const outcomes = [...new Map(tacticOutcomes.map((outcome) => [outcome.tactic, outcome])).values()]
    .sort((left, right) => left.tactic.localeCompare(right.tactic));

  for (const outcome of outcomes) {
    await tx.insert(skills).values({
      userId,
      tactic: outcome.tactic,
      theta: DEFAULT_RATING,
      box: 0,
      dueAt: now,
      exposures: 0,
      updatedAt: now,
    }).onConflictDoNothing();

    const [skill] = await tx.select().from(skills)
      .where(and(eq(skills.userId, userId), eq(skills.tactic, outcome.tactic)))
      .for("update")
      .limit(1);
    if (!skill) throw new Error("Unable to lock trainee skill row");

    await tx.insert(itemDifficulty).values({
      personaId,
      tactic: outcome.tactic,
      difficulty,
      d: DIFFICULTY_BASE[difficulty],
      n: 0,
    }).onConflictDoNothing();

    const [item] = await tx.select().from(itemDifficulty)
      .where(and(
        eq(itemDifficulty.personaId, personaId),
        eq(itemDifficulty.tactic, outcome.tactic),
        eq(itemDifficulty.difficulty, difficulty),
      ))
      .for("update")
      .limit(1);
    if (!item) throw new Error("Unable to lock item difficulty row");

    const updated = updateElo(skill.theta, item.d, outcome.o);
    const box = nextBox(skill.box, outcome.o);
    await tx.update(skills).set({
      theta: updated.theta,
      box,
      dueAt: new Date(dueAt(now.getTime(), box)),
      lastPersonaId: personaId,
      exposures: skill.exposures + 1,
      updatedAt: now,
    }).where(and(eq(skills.userId, userId), eq(skills.tactic, outcome.tactic)));

    await tx.update(itemDifficulty).set({ d: updated.d, n: item.n + 1 })
      .where(and(
        eq(itemDifficulty.personaId, personaId),
        eq(itemDifficulty.tactic, outcome.tactic),
        eq(itemDifficulty.difficulty, difficulty),
      ));
  }
}
