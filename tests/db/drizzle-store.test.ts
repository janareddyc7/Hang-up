import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleDrillStore } from "../../src/lib/drill/drizzle-store";
import * as schema from "../../src/db/schema";
import type { DrillRecord } from "../../src/lib/drill/runtime";
import { loadPersonas } from "../../src/lib/engine/personas";
import { initialState, openingAction } from "../../src/lib/engine/director";
import { generateWallet } from "../../src/lib/engine/wallet";
import { scoreDrill } from "../../src/lib/engine/scoring";
import techSupport from "../../content/personas/tech-support.json";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const database = pool ? drizzle(pool, { schema }) : null;
const store = database ? new DrizzleDrillStore(database) : null;
const persona = loadPersonas([techSupport]).get("tech-support")!;

function fixture(id: string): DrillRecord {
  const state = initialState(persona, "easy", id);
  const opened = openingAction(state, persona);
  if (opened.action.kind !== "speak") throw new Error("expected opening line");
  return {
    id, userId: null, judgeSessionHash: "a".repeat(64), personaId: persona.id, difficulty: "easy", mode: "judge", seed: id,
    wallet: generateWallet(id), state: opened.state,
    turns: [{ speaker: "scammer", k: opened.action.k, stage: opened.action.stage, tactics: opened.action.tactics, text: persona.firstMessage, source: "first_message", tMs: 0 }],
    startedAtMs: Date.now(), status: "live", version: 1,
  };
}

suite("DrizzleDrillStore (TEST_DATABASE_URL)", () => {
  const ids: string[] = [];
  afterAll(async () => {
    if (!database) return;
    for (const id of ids) await database.delete(schema.drills).where(eq(schema.drills.id, id));
    await pool?.end();
  });

  it("round-trips a DrillRecord with ordered turns", async () => {
    const record = fixture(`test-${crypto.randomUUID()}`); ids.push(record.id);
    await store!.save(record);
    expect(await store!.get(record.id)).toEqual(record);
  });

  it("rejects a stale version", async () => {
    const record = fixture(`test-${crypto.randomUUID()}`); ids.push(record.id);
    await store!.save(record);
    await expect(store!.save({ ...record, version: 3 })).rejects.toThrow("version conflict");
  });

  it("appends new turns and preserves existing rows", async () => {
    const record = fixture(`test-${crypto.randomUUID()}`); ids.push(record.id);
    await store!.save(record);
    const originalFirstTurn = record.turns[0]!;
    const attemptedRewrite = { ...originalFirstTurn, text: "An attempted rewrite must not replace stored text." };
    const next = { ...record, version: 2, turns: [attemptedRewrite, { speaker: "user" as const, afterK: 1, text: "No thank you.", move: "refuse" as const, confidence: 0.9, decidedBy: "rule" as const, tMs: 500 }] };
    await store!.save(next);
    expect((await store!.get(record.id))?.turns).toEqual([originalFirstTurn, next.turns[1]]);
  });

  it("persists ended drill score fields", async () => {
    const record = fixture(`test-${crypto.randomUUID()}`); ids.push(record.id);
    const score = scoreDrill(record.turns, "user_hung_up");
    const ended = { ...record, status: "ended" as const, endReason: "user_hung_up" as const, score, version: 2, state: { ...record.state, ended: true, endReason: "user_hung_up" as const } };
    await store!.save(record); await store!.save(ended);
    expect(await store!.get(record.id)).toEqual(ended);
    const [row] = await database!.select().from(schema.drills).where(eq(schema.drills.id, record.id));
    expect(row).toMatchObject({ score: score.score, outcome: score.outcome, scoreDetail: score, endReason: "user_hung_up" });
    expect(row?.endedAt).toBeInstanceOf(Date);
  });
});
