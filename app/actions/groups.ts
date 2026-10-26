"use server";

import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db/client";
import { drills, groupSessions, groupVotes } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";

const CodeSchema = z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z]{4}$/);
const CreateSchema = z.object({
  personaId: z.string().min(1).max(100),
  difficulty: z.enum(["easy", "realistic", "relentless"]),
}).strict();
const SnapshotSchema = z.object({ code: CodeSchema }).strict();
const VoteSchema = z.object({ code: CodeSchema, k: z.number().int().min(1).max(18) }).strict();

type ActionError = { ok: false; error: string };
const joinAttempts = new Map<string, { startedAt: number; count: number }>();
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function cookieName(code: string) { return `hangup_group_${code}`; }

async function allowJoinAttempt() {
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";
  const now = Date.now();
  const row = joinAttempts.get(ip);
  if (!row || now - row.startedAt > 60_000) {
    joinAttempts.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  if (row.count >= 30) return false;
  row.count += 1;
  return true;
}

export async function createGroupSession(input: unknown): Promise<
  { ok: true; sessionId: string; joinCode: string } | ActionError
> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a valid practice caller." };
  const facilitator = await requireUser();
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const joinCode = Array.from({ length: 4 }, () => codeAlphabet[crypto.getRandomValues(new Uint8Array(1))[0]! % codeAlphabet.length]).join("");
      const sessionId = `grp_${crypto.randomUUID()}`;
      const inserted = await db.insert(groupSessions).values({
        id: sessionId,
        facilitatorId: facilitator.id,
        joinCode,
        status: "open",
      }).onConflictDoNothing().returning({ id: groupSessions.id });
      if (inserted.length > 0) return { ok: true, sessionId, joinCode };
    }
    return { ok: false, error: "A room could not be created. Please try again." };
  } catch {
    return { ok: false, error: "A room could not be created. Please try again." };
  }
}

export async function joinGroup(input: unknown): Promise<
  { ok: true; currentK: number; status: "open" | "live" | "closed"; voteRecorded: boolean } | ActionError
> {
  const parsed = SnapshotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the four-letter room code." };
  if (!(await allowJoinAttempt())) return { ok: false, error: "Too many tries. Wait a minute and try again." };

  const code = parsed.data.code;
  const [session] = await db.select().from(groupSessions).where(eq(groupSessions.joinCode, code)).limit(1);
  if (!session || Date.now() - session.createdAt.getTime() > 8 * 60 * 60 * 1000) {
    return { ok: false, error: "That room has expired or the code is incorrect." };
  }
  const participantKey = (await cookies()).get(cookieName(code))?.value ?? crypto.randomUUID();
  (await cookies()).set(cookieName(code), participantKey, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/group/${code}`,
    maxAge: 8 * 60 * 60,
  });
  const [drill] = session.drillId
    ? await db.select({ state: drills.state }).from(drills).where(eq(drills.id, session.drillId)).limit(1)
    : [];
  const [vote] = await db.select({ k: groupVotes.k }).from(groupVotes)
    .where(and(eq(groupVotes.sessionId, session.id), eq(groupVotes.participantKey, participantKey))).limit(1);
  const status = session.status === "live" ? "live" : session.status === "closed" ? "closed" : "open";
  return { ok: true, currentK: drill?.state.k ?? 0, status, voteRecorded: Boolean(vote) };
}

export async function getGroupSnapshot(input: unknown): Promise<
  { ok: true; currentK: number; status: "open" | "live" | "closed"; votes: Array<{ k: number; count: number }>; voteRecorded: boolean } | ActionError
> {
  const parsed = SnapshotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That room is unavailable." };
  const code = parsed.data.code;
  const [session] = await db.select().from(groupSessions).where(eq(groupSessions.joinCode, code)).limit(1);
  if (!session || Date.now() - session.createdAt.getTime() > 8 * 60 * 60 * 1000) {
    return { ok: false, error: "That room has expired." };
  }
  const participantKey = (await cookies()).get(cookieName(code))?.value;
  if (!participantKey) return { ok: false, error: "Join this room again to continue." };
  const [drill] = session.drillId
    ? await db.select({ state: drills.state }).from(drills).where(eq(drills.id, session.drillId)).limit(1)
    : [];
  const votes = await db.select({ k: groupVotes.k }).from(groupVotes).where(eq(groupVotes.sessionId, session.id));
  const [myVote] = await db.select({ k: groupVotes.k }).from(groupVotes)
    .where(and(eq(groupVotes.sessionId, session.id), eq(groupVotes.participantKey, participantKey))).limit(1);
  const totals = new Map<number, number>();
  for (const vote of votes) totals.set(vote.k, (totals.get(vote.k) ?? 0) + 1);
  return {
    ok: true,
    currentK: drill?.state.k ?? 0,
    status: session.status === "live" ? "live" : session.status === "closed" ? "closed" : "open",
    votes: [...totals].map(([k, count]) => ({ k, count })).sort((a, b) => a.k - b.k),
    voteRecorded: Boolean(myVote),
  };
}

export async function voteHangUp(input: unknown): Promise<{ ok: true } | ActionError> {
  const parsed = VoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Wait for the caller to speak before voting." };
  const { code, k } = parsed.data;
  const participantKey = (await cookies()).get(cookieName(code))?.value;
  if (!participantKey) return { ok: false, error: "Join this room again before voting." };
  const [session] = await db.select().from(groupSessions).where(eq(groupSessions.joinCode, code)).limit(1);
  if (!session || Date.now() - session.createdAt.getTime() > 8 * 60 * 60 * 1000 || session.status !== "live" || !session.drillId) {
    return { ok: false, error: "Voting is closed for this room." };
  }
  const [drill] = await db.select({ currentK: drills.state }).from(drills).where(eq(drills.id, session.drillId)).limit(1);
  if (!drill || k !== drill.currentK.k || drill.currentK.ended) return { ok: false, error: "The caller has moved on. Please vote on the current line." };
  try {
    await db.insert(groupVotes).values({ sessionId: session.id, participantKey, k })
      .onConflictDoNothing({ target: [groupVotes.sessionId, groupVotes.participantKey] });
    return { ok: true };
  } catch {
    return { ok: false, error: "Your vote could not be recorded. Try again." };
  }
}

