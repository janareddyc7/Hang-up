import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";

const mocks = vi.hoisted(() => ({ userId: `pilot-${crypto.randomUUID()}` }));
vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: mocks.userId })) }));
vi.mock("@/env", () => ({ env: { PILOT_ENABLED: true } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../content/pilot.json", () => ({ default: {
  adultReviewed: true, consentVersion: "synthetic-test-v1", consentText: "Synthetic test-only consent. ".repeat(8),
  citation: "Synthetic fixture for testing protocol guards only.", sourceUrl: "https://example.test/instrument",
  minimum: 1, maximum: 5, lowLabel: "Test low", highLabel: "Test high",
  items: Array.from({ length: 5 }, (_, i) => ({ id: `test-${i}`, text: `Synthetic test-only item ${i}`, reverse: false })),
} }));

import { enrollPilot, submitPilotSurvey, withdrawPilot } from "../../app/actions/pilot";
import { authorizePilotCall, pilotHoldout, pilotProgress } from "@/lib/pilot/server";

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const pool = url ? new Pool({ connectionString: url }) : null;
const database = pool ? drizzle(pool, { schema }) : null;

suite("pilot authorization and consent (isolated TEST_DATABASE_URL)", () => {
  beforeAll(async () => { await database!.insert(schema.user).values({ id: mocks.userId, email: `${mocks.userId}@example.test`, name: "Synthetic pilot participant", emailVerified: true }); });
  afterAll(async () => { if (database) await database.delete(schema.user).where(eq(schema.user.id, mocks.userId)); await pool?.end(); });

  it("requires explicit versioned consent, reserves an unseen holdout, and gates phases", async () => {
    expect((await enrollPilot({ consent: false, consentVersion: "synthetic-test-v1" })).ok).toBe(false);
    expect(await enrollPilot({ consent: true, consentVersion: "synthetic-test-v1" })).toEqual({ ok: true });
    const holdout = await pilotHoldout(mocks.userId);
    expect(holdout).toBeTruthy();
    expect(await authorizePilotCall(mocks.userId, "pre", holdout!)).toBe(false);
    expect(await submitPilotSurvey({ phase: "pre", answers: [1, 2, 3, 4, 5] })).toEqual({ ok: true });
    expect(await authorizePilotCall(mocks.userId, "pre", holdout!)).toBe(true);
    expect(await authorizePilotCall("another-user", "pre", holdout!)).toBe(false);
    expect((await submitPilotSurvey({ phase: "post", answers: [1, 2, 3, 4, 5] })).ok).toBe(false);
    expect((await pilotProgress(mocks.userId))?.rows[0]?.surveyTotal).toBe(15);
  });

  it("withdraws consent and deletes study responses before allowing ordinary practice again", async () => {
    expect(await withdrawPilot()).toEqual({ ok: true });
    expect(await pilotHoldout(mocks.userId)).toBeNull();
    expect((await pilotProgress(mocks.userId))?.rows).toEqual([]);
    expect((await submitPilotSurvey({ phase: "pre", answers: [1, 1, 1, 1, 1] })).ok).toBe(false);
  });
});
