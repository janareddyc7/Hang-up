import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { createDrill, finishDrill } from "@/lib/drill/runtime";
import { DrizzleDrillStore } from "@/lib/drill/drizzle-store";
import { personas as sourcePersonas } from "../helpers";

const mocks = vi.hoisted(() => ({
  reviewer: { id: "", name: "", email: "" },
  adminEmails: [] as string[],
  requireUser: vi.fn(async () => mocks.reviewer),
}));

vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/env", () => ({ env: { get ADMIN_EMAILS() { return mocks.adminEmails; } } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));

import { submitHumanLabel } from "../../app/actions/labels";

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
const pool = testUrl ? new Pool({ connectionString: testUrl }) : null;
const database = pool ? drizzle(pool, { schema }) : null;
const userId = `label-test-${crypto.randomUUID()}`;
const email = `${userId}@example.test`;

suite("blind label actions (TEST_DATABASE_URL)", () => {
  let turnId = 0;
  const persona = sourcePersonas.get("tech-support")!;
  const deps = {
    store: database ? new DrizzleDrillStore(database) : null!,
    personas: new Map([[persona.id, persona]]),
    now: () => Date.UTC(2026, 0, 1),
    newId: () => `label-drill-${crypto.randomUUID()}`,
  };

  beforeAll(async () => {
    await database!.insert(schema.user).values({ id: userId, name: "Label admin", email, emailVerified: true });
    mocks.adminEmails = [email];
    mocks.reviewer = { id: userId, name: "Label admin", email };
    const created = await createDrill(deps, { personaId: persona.id, difficulty: "realistic", userId, mode: "sparring" });
    const opening = created.record.turns[0]!;
    if (opening.speaker !== "scammer") throw new Error("expected caller opening");
    const updated = { ...created.record, version: 2, turns: [...created.record.turns, { speaker: "user" as const, afterK: opening.k, text: "I am not sure.", move: "question" as const, confidence: 0.9, decidedBy: "classifier" as const, tMs: 500 }] };
    await deps.store.save(updated);
    await finishDrill(deps, created.drillId);
    const [userTurn] = await database!.select({ id: schema.turns.id }).from(schema.turns)
      .where(eq(schema.turns.drillId, created.drillId)).orderBy(schema.turns.seq);
    const rows = await database!.select({ id: schema.turns.id, speaker: schema.turns.speaker }).from(schema.turns).where(eq(schema.turns.drillId, created.drillId)).orderBy(schema.turns.seq);
    turnId = rows.find((row) => row.speaker === "user")?.id ?? userTurn?.id ?? 0;
  });

  afterAll(async () => {
    if (!database) return;
    await database.delete(schema.moveLabels).where(eq(schema.moveLabels.labeledBy, userId));
    await database.delete(schema.user).where(eq(schema.user.id, userId));
    await pool?.end();
  });

  it("permits only allowlisted reviewers and redacts notes before storage", async () => {
    mocks.reviewer = { id: userId, name: "Label admin", email: "someone-else@example.test" };
    expect(await submitHumanLabel({ turnId, move: "question" })).toMatchObject({ ok: false });

    mocks.reviewer = { id: userId, name: "Label admin", email };
    expect(await submitHumanLabel({ turnId, move: "question", notes: "The caller mentioned 123456789." })).toEqual({ ok: true });
    const [label] = await database!.select().from(schema.moveLabels).where(eq(schema.moveLabels.turnId, turnId));
    expect(label?.notes).not.toContain("123456789");
    expect(label?.notes).toContain("[number removed]");
    expect(await submitHumanLabel({ turnId, move: "unclear" })).toMatchObject({ ok: false });
  });
});
