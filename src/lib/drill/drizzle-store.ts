import { and, eq, isNull, max } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { applyDrillToSkills } from "../skills/update";
import type { DrillRecord, DrillStore } from "./runtime";
import { DrillVersionConflict } from "./errors";
import * as schema from "../../db/schema";
import { drills, turns } from "../../db/schema";
import { TurnSchema, type Turn } from "../engine/schema";

type Database = NodePgDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Persists drills and their append-only, already-redacted turn history. */
export class DrizzleDrillStore implements DrillStore {
  constructor(private readonly database: Database) {}

  async get(id: string): Promise<DrillRecord | null> {
    const [row] = await this.database.select().from(drills).where(eq(drills.id, id)).limit(1);
    if (!row) return null;
    const storedTurns = await this.database.select().from(turns).where(eq(turns.drillId, id)).orderBy(turns.seq);
    const result = row.scoreDetail;
    const record: DrillRecord = {
      id: row.id,
      userId: row.userId,
      mode: row.mode,
      ...(row.assignmentId ? { assignmentId: row.assignmentId } : {}),
      ...(row.isAssessment ? { isAssessment: true } : {}),
      personaId: row.personaId,
      difficulty: row.difficulty,
      seed: row.seed,
      wallet: row.wallet,
      state: row.state,
      turns: storedTurns.map((turn) => toTurn(turn)),
      startedAtMs: row.startedAt.getTime(),
      status: row.status,
      version: row.version,
    };
    if (row.judgeSessionHash) record.judgeSessionHash = row.judgeSessionHash;
    if (row.endReason) record.endReason = row.endReason;
    if (result) record.score = result;
    return record;
  }

  async save(record: DrillRecord): Promise<void> {
    await this.database.transaction((tx) => this.saveRecord(tx, record));
  }

  /** Saves the final score and learning changes exactly once in one transaction. */
  async finalize(record: DrillRecord, nowMs: number): Promise<void> {
    await this.database.transaction(async (tx) => {
      const [current] = await tx.select({
        id: drills.id,
        version: drills.version,
        status: drills.status,
        userId: drills.userId,
        personaId: drills.personaId,
        difficulty: drills.difficulty,
        scoreDetail: drills.scoreDetail,
        skillsAppliedAt: drills.skillsAppliedAt,
        assignmentId: drills.assignmentId,
        isAssessment: drills.isAssessment,
      }).from(drills).where(eq(drills.id, record.id)).for("update").limit(1);
      if (!current) throw new Error("unknown drill");

      let score = current.scoreDetail ?? record.score;
      if (current.status === "live") {
        if (record.status !== "ended" || !record.score || current.version !== record.version - 1) {
          throw new DrillVersionConflict();
        }
        await this.saveRecord(tx, record);
        score = record.score;
      }

      if (current.skillsAppliedAt === null) {
        if (current.userId && score && !current.isAssessment) {
          await applyDrillToSkills(
            tx,
            current.userId,
            current.personaId,
            current.difficulty,
            score.tacticOutcomes,
            new Date(nowMs),
          );
        }
        await tx.update(drills).set({ skillsAppliedAt: new Date(nowMs) }).where(eq(drills.id, record.id));
      }
      if (current.assignmentId && current.userId) {
        await tx.update(schema.assignments).set({ completedDrillId: record.id })
          .where(and(
            eq(schema.assignments.id, current.assignmentId),
            eq(schema.assignments.traineeId, current.userId),
            isNull(schema.assignments.completedDrillId),
          ));
      }
    });
  }

  private async saveRecord(tx: Transaction, record: DrillRecord): Promise<void> {
    const score = record.score;
    const values = {
      userId: record.userId,
      judgeSessionHash: record.judgeSessionHash ?? null,
      personaId: record.personaId,
      personaVersion: 1,
      difficulty: record.difficulty,
      mode: record.mode ?? (record.userId === null ? "judge" : "sparring"),
      assignmentId: record.assignmentId ?? null,
      isAssessment: record.isAssessment ?? false,
      seed: record.seed,
      status: record.status,
      endReason: record.endReason ?? null,
      state: record.state,
      wallet: record.wallet,
      startedAt: new Date(record.startedAtMs),
      endedAt: record.status === "ended" ? new Date(record.startedAtMs + (record.turns.at(-1)?.tMs ?? 0)) : null,
      score: score?.score ?? null,
      outcome: score?.outcome ?? null,
      scoreDetail: score ?? null,
      version: record.version,
    };

    if (record.version === 1) {
      await tx.insert(drills).values({ id: record.id, ...values });
    } else {
      const updated = await tx.update(drills).set(values)
        .where(and(eq(drills.id, record.id), eq(drills.version, record.version - 1)))
        .returning({ id: drills.id });
      if (updated.length !== 1) throw new DrillVersionConflict();
    }

    const [highest] = await tx.select({ seq: max(turns.seq) }).from(turns).where(eq(turns.drillId, record.id));
    const storedMax = highest?.seq;
    const maxSeq = storedMax === null || storedMax === undefined ? 0 : Number(storedMax);
    const additions = record.turns.map((turn, index) => ({ turn, seq: index + 1 })).filter(({ seq }) => seq > maxSeq);
    if (additions.length > 0) {
      await tx.insert(turns).values(additions.map(({ turn, seq }) => toRow(record.id, seq, turn)));
    }
  }
}

function toRow(drillId: string, seq: number, turn: Turn) {
  if (turn.speaker === "scammer") return {
    drillId, seq, speaker: turn.speaker, k: turn.k, stage: turn.stage, tactics: turn.tactics,
    move: null, confidence: null, decidedBy: null, source: turn.source, text: turn.text, tMs: turn.tMs,
  };
  return {
    drillId, seq, speaker: turn.speaker, k: turn.afterK, stage: null, tactics: [],
    move: turn.move, confidence: turn.confidence, decidedBy: turn.decidedBy, source: null, text: turn.text, tMs: turn.tMs,
  };
}

function toTurn(row: (typeof turns)["$inferSelect"]): Turn {
  if (row.speaker === "scammer") {
    if (!row.stage || !row.source) throw new Error("invalid stored scammer turn");
    return TurnSchema.parse({ speaker: "scammer", k: row.k, stage: row.stage, tactics: row.tactics, text: row.text, source: row.source, tMs: row.tMs });
  }
  if (!row.move || !row.decidedBy || row.confidence === null) throw new Error("invalid stored user turn");
  return TurnSchema.parse({ speaker: "user", afterK: row.k, text: row.text, move: row.move, confidence: row.confidence, decidedBy: row.decidedBy, tMs: row.tMs });
}
