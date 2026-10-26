import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { hashCircleInvite } from "@/lib/circle/invites";

const mocks = vi.hoisted(() => ({
  currentUser: { id: "", name: "", email: "" },
  requireUser: vi.fn(async () => mocks.currentUser),
}));

vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: { RESEND_API_KEY: "test-key", EMAIL_FROM: "Hang Up <test@example.test>", BETTER_AUTH_URL: "http://localhost:3000", APP_URL: "http://localhost:3000" } }));
vi.mock("@/lib/drill/deps", () => ({ getRuntimeDeps: () => ({ personas: new Map([["tech-support", {}]]) }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { acceptInvite, assignDrill, createCircle, inviteToCircle, setShareTranscripts } from "../../app/actions/circle";

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
const pool = testUrl ? new Pool({ connectionString: testUrl }) : null;
const database = pool ? drizzle(pool, { schema }) : null;
const coachId = `circle-coach-${crypto.randomUUID()}`;
const traineeId = `circle-trainee-${crypto.randomUUID()}`;
const coachEmail = `${coachId}@example.test`;
const traineeEmail = `${traineeId}@example.test`;

suite("Family Circle actions (TEST_DATABASE_URL)", () => {
  let circleId = "";
  let mailBodies: Array<{ text: string; html: string }> = [];

  beforeAll(async () => {
    await database!.insert(schema.user).values([
      { id: coachId, name: "Circle coach", email: coachEmail, emailVerified: true },
      { id: traineeId, name: "Circle trainee", email: traineeEmail, emailVerified: true },
    ]);
  });

  beforeEach(async () => {
    mocks.currentUser = { id: coachId, name: "Circle coach", email: coachEmail };
    mocks.requireUser.mockClear();
    mailBodies = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { text: string; html: string };
      mailBodies.push(body);
      return new Response(JSON.stringify({ id: "email-test" }), { status: 200 });
    }));
    const result = await createCircle({ name: `Test circle ${crypto.randomUUID().slice(0, 6)}` });
    if (!result.ok) throw new Error(result.error);
    circleId = result.circleId;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (!database) return;
    await database.delete(schema.user).where(eq(schema.user.id, coachId));
    await database.delete(schema.user).where(eq(schema.user.id, traineeId));
    await pool?.end();
  });

  it("stores only a token hash, binds acceptance to the invite email, and accepts once", async () => {
    const sent = await inviteToCircle({ circleId, email: traineeEmail.toUpperCase(), role: "trainee" });
    expect(sent).toEqual({ ok: true });
    const token = mailBodies[0]?.text.match(/circle\/invite\/([A-Za-z0-9_-]{40,})/)?.[1];
    expect(token).toBeTruthy();
    const [row] = await database!.select().from(schema.circleInvites).where(eq(schema.circleInvites.circleId, circleId));
    expect(row?.email).toBe(traineeEmail);
    expect(row?.tokenHash).toBe(hashCircleInvite(token!));
    expect(row?.tokenHash).not.toBe(token);

    mocks.currentUser = { id: coachId, name: "Circle coach", email: coachEmail };
    expect((await acceptInvite({ token })).ok).toBe(false);
    mocks.currentUser = { id: traineeId, name: "Circle trainee", email: traineeEmail };
    expect(await acceptInvite({ token })).toEqual({ ok: true, circleId });
    expect((await acceptInvite({ token })).ok).toBe(false);
    const member = await database!.select().from(schema.circleMembers).where(eq(schema.circleMembers.userId, traineeId));
    expect(member).toContainEqual(expect.objectContaining({ circleId, role: "trainee", shareTranscripts: false }));
  });

  it("lets only trainees change transcript sharing and only coaches assign drills", async () => {
    await database!.insert(schema.circleMembers).values({ circleId, userId: traineeId, role: "trainee" });
    expect(await setShareTranscripts({ circleId, share: true })).toMatchObject({ ok: false });
    mocks.currentUser = { id: traineeId, name: "Circle trainee", email: traineeEmail };
    expect(await assignDrill({ circleId, traineeId, personaId: "tech-support" })).toMatchObject({ ok: false });
    expect(await setShareTranscripts({ circleId, share: true })).toEqual({ ok: true });
    mocks.currentUser = { id: coachId, name: "Circle coach", email: coachEmail };
    expect(await assignDrill({ circleId, traineeId, personaId: "tech-support", difficulty: "realistic" })).toMatchObject({ ok: true });
  });

  it("rejects expired invitations", async () => {
    const token = crypto.randomUUID().replaceAll("-", "") + "01234567890123456789012345678901";
    await database!.insert(schema.circleInvites).values({
      id: `expired-${crypto.randomUUID()}`,
      circleId,
      email: traineeEmail,
      role: "trainee",
      tokenHash: hashCircleInvite(token),
      expiresAt: new Date(Date.now() - 60_000),
    });
    mocks.currentUser = { id: traineeId, name: "Circle trainee", email: traineeEmail };
    expect(await acceptInvite({ token })).toMatchObject({ ok: false });
  });
});
