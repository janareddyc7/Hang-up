"use server";

import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db/client";
import { assignments, drills, groupSessions, pilotAssessments, tagFlags, turns } from "@/db/schema";
import { getSession, requireUser } from "@/lib/auth/session";
import { env } from "@/env";
import { getRuntimeDeps } from "@/lib/drill/deps";
import { createDrill, DRILL_TTL_MS, finishDrill as finishRuntimeDrill, runTurn, type DrillRecord } from "@/lib/drill/runtime";
import { mintDrillSession } from "@/lib/drill/session-token";
import { redact } from "@/lib/engine/wallet";
import { ensureJudgeSessionHash, hasJudgeSession } from "@/lib/replay/judge-session";
import type { Difficulty } from "@/lib/engine/schema";
import type { ScoreResult } from "@/lib/engine/scoring";
import { PilotPhaseSchema } from "@/lib/pilot/protocol";
import { authorizePilotCall, pilotHoldout } from "@/lib/pilot/server";

const StartDrillInputSchema = z.object({
  personaId: z.string().min(1).max(100),
  difficulty: z.enum(["easy", "realistic", "relentless"]),
  mode: z.enum(["judge", "sparring", "assigned", "group"]),
  textOnly: z.boolean(),
  offline: z.boolean().default(false),
  assignmentId: z.string().min(1).max(100).optional(),
  groupSessionId: z.string().min(8).max(100).optional(),
  pilotPhase: PilotPhaseSchema.optional(),
}).strict();

const DrillIdSchema = z.object({ drillId: z.string().min(1).max(100) }).strict();
const AttachConversationSchema = DrillIdSchema.extend({ conversationId: z.string().min(1).max(200) }).strict();
const LocalTextTurnSchema = DrillIdSchema.extend({ text: z.string().trim().min(1).max(4000) }).strict();
const FlagTagSchema = z.object({ turnId: z.number().int().positive(), reason: z.string().trim().max(500).optional() }).strict();

type ActionError = { ok: false; error: string };
type StartDrillResult =
  | {
      ok: true;
      drillId: string;
      connection: { conversationToken: string } | { signedUrl: string } | null;
      offlineFallback: boolean;
      firstMessage: string;
      voiceId: string;
      callerIdDisplay: string;
      wallet: Awaited<ReturnType<typeof createDrill>>["record"]["wallet"];
      sessionUserId: string | null;
      llmSessionToken: string;
    }
  | ActionError;

const JUDGE_LIMIT = 10;
const JUDGE_WINDOW_MS = 60 * 60 * 1000;
const judgeStarts = new Map<string, number[]>();

function allowJudgeStart(ip: string, now = Date.now()): boolean {
  const recent = (judgeStarts.get(ip) ?? []).filter((time) => now - time < JUDGE_WINDOW_MS);
  if (recent.length >= JUDGE_LIMIT) {
    judgeStarts.set(ip, recent);
    return false;
  }
  recent.push(now);
  judgeStarts.set(ip, recent);
  return true;
}

async function requestIp(): Promise<string> {
  const requestHeaders = await headers();
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    || requestHeaders.get("x-real-ip")
    || "unknown";
}

function errorMessage(error: unknown): string {
  return error instanceof z.ZodError ? "Check the drill details and try again." : "The drill could not be started. Check the server setup and try again.";
}

export async function startDrill(input: unknown): Promise<StartDrillResult> {
  const parsed = StartDrillInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the drill details and try again." };
  const request = parsed.data;
  if (request.offline && !request.textOnly) {
    return { ok: false, error: "Select text mode to start without a voice session." };
  }

  try {
    const session = request.mode === "judge" ? await getSession() : null;
    const user = request.mode === "judge" ? session?.user ?? null : await requireUser();
    if (request.mode === "judge" && !allowJudgeStart(await requestIp())) {
      return { ok: false, error: "Too many practice calls. Please try again in an hour." };
    }

    const deps = getRuntimeDeps();
    if (request.mode === "group") {
      if (!request.groupSessionId || !user) return { ok: false, error: "Create a group room before starting its call." };
      const [room] = await db.select({ id: groupSessions.id }).from(groupSessions).where(and(
        eq(groupSessions.id, request.groupSessionId),
        eq(groupSessions.facilitatorId, user.id),
        eq(groupSessions.status, "open"),
      )).limit(1);
      if (!room) return { ok: false, error: "That group room is no longer available." };
    }
    let personaId = request.personaId;
    let difficulty: Difficulty = request.difficulty;
    if (request.mode === "assigned") {
      if (!request.assignmentId || !user) return { ok: false, error: "Sign in to start an assigned call." };
      const [assignment] = await db.select({ personaId: assignments.personaId, difficulty: assignments.difficulty })
        .from(assignments)
        .where(and(eq(assignments.id, request.assignmentId), eq(assignments.traineeId, user.id)))
        .limit(1);
      if (!assignment) return { ok: false, error: "That assignment is unavailable." };
      if (assignment.personaId) personaId = assignment.personaId;
      if (assignment.difficulty) difficulty = assignment.difficulty;
    }

    const persona = deps.personas.get(personaId);
    if (!persona) return { ok: false, error: "Choose a valid caller scenario." };
    if (request.pilotPhase) {
      if (!user || request.mode !== "sparring" || !(await authorizePilotCall(user.id, request.pilotPhase, personaId))) {
        return { ok: false, error: "Complete the eligible pilot survey before starting its holdout call." };
      }
    } else if (user && await pilotHoldout(user.id) === personaId) {
      return { ok: false, error: "This scenario is reserved for your pilot assessment. Choose another practice caller." };
    }
    const judgeSessionHash = request.mode === "judge" && !user ? await ensureJudgeSessionHash() : undefined;
    const apiKey = env.ELEVENLABS_API_KEY;
    const agentId = env.ELEVENLABS_AGENT_ID;
    const voiceId = env.ELEVENLABS_VOICE_IDS?.[persona.voiceRole];
    let connection: { conversationToken: string } | { signedUrl: string } | null = null;

    if (!request.offline && apiKey && agentId && voiceId) {
      const tokenPath = request.textOnly ? "conversation/get-signed-url" : "conversation/token";
      try {
        const tokenResponse = await fetch(`https://api.elevenlabs.io/v1/convai/${tokenPath}?agent_id=${encodeURIComponent(agentId)}`, {
          headers: { "xi-api-key": apiKey },
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });
        if (tokenResponse.ok) {
          const tokenBody: unknown = await tokenResponse.json();
          connection = request.textOnly
            ? { signedUrl: z.object({ signed_url: z.string().url() }).parse(tokenBody).signed_url }
            : { conversationToken: z.object({ token: z.string().min(1) }).parse(tokenBody).token };
        }
      } catch {
        // Every browser practice mode can continue through the same Director in text.
      }
    }

    const created = await createDrill(deps, {
      personaId,
      difficulty,
      userId: user?.id ?? null,
      mode: request.mode,
      ...(request.mode === "assigned" && request.assignmentId ? { assignmentId: request.assignmentId } : {}),
      judgeSessionHash,
      isAssessment: Boolean(request.pilotPhase),
      ...(request.pilotPhase ? { seed: `pilot:${request.pilotPhase}:${crypto.randomUUID()}` } : {}),
    });
    if (request.pilotPhase && user) {
      const linked = await db.update(pilotAssessments).set({ drillId: created.drillId }).where(and(
        eq(pilotAssessments.userId, user.id), eq(pilotAssessments.phase, request.pilotPhase), isNull(pilotAssessments.drillId),
      )).returning({ userId: pilotAssessments.userId });
      if (linked.length === 0) {
        await db.delete(drills).where(eq(drills.id, created.drillId));
        return { ok: false, error: "This assessment has already started. Return to the pilot page to view its replay." };
      }
    }
    if (request.mode === "group" && request.groupSessionId) {
      const linked = await db.update(groupSessions).set({ drillId: created.drillId, status: "live" }).where(and(
        eq(groupSessions.id, request.groupSessionId),
        eq(groupSessions.facilitatorId, user!.id),
        eq(groupSessions.status, "open"),
      )).returning({ id: groupSessions.id });
      if (linked.length === 0) {
        await db.delete(drills).where(eq(drills.id, created.drillId));
        return { ok: false, error: "Someone has already started this group room." };
      }
    }
    return {
      ok: true,
      drillId: created.drillId,
      connection,
      offlineFallback: connection === null,
      firstMessage: created.firstMessage,
      voiceId: voiceId ?? "",
      callerIdDisplay: created.callerIdDisplay,
      wallet: created.record.wallet,
      sessionUserId: user?.id ?? null,
      llmSessionToken: mintDrillSession(deps.llmSecret, { drillId: created.drillId, userId: user?.id ?? null, expiresAt: deps.now() + DRILL_TTL_MS }),
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function attachConversation(input: unknown): Promise<{ ok: true } | ActionError> {
  const parsed = AttachConversationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid conversation details." };
  try {
    const deps = getRuntimeDeps();
    const record = await deps.store.get(parsed.data.drillId);
    if (!record || record.status !== "live") return { ok: false, error: "This practice call is no longer active." };
    if (!(await canAccessDrill(record))) return { ok: false, error: "You cannot update this practice call." };
    await db.update(drills).set({ elevenlabsConversationId: parsed.data.conversationId }).where(eq(drills.id, record.id));
    return { ok: true };
  } catch {
    return { ok: false, error: "The conversation could not be attached." };
  }
}

function toScoreSummary(score: ScoreResult) {
  return {
    score: score.score,
    outcome: score.outcome,
    pointOfNoReturnK: score.pointOfNoReturnK,
    turnsPastPointOfNoReturn: score.turnsPastPointOfNoReturn,
    msPastPointOfNoReturn: score.msPastPointOfNoReturn,
    habit: score.habit,
  };
}

export async function finishDrill(input: unknown): Promise<{ ok: true; score: ReturnType<typeof toScoreSummary> } | ActionError> {
  const parsed = DrillIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid practice call." };
  try {
    const deps = getRuntimeDeps();
    const record = await deps.store.get(parsed.data.drillId);
    if (!record) return { ok: false, error: "This practice call could not be found." };
    if (!(await canAccessDrill(record))) return { ok: false, error: "You cannot finish this practice call." };
    const score = await finishRuntimeDrill(deps, record.id);
    if (record.mode === "group") {
      await db.update(groupSessions).set({ status: "closed" }).where(and(eq(groupSessions.drillId, record.id), eq(groupSessions.facilitatorId, record.userId ?? "")));
    }
    return { ok: true, score: toScoreSummary(score) };
  } catch {
    return { ok: false, error: "The practice call could not be finished." };
  }
}

export async function localTextTurn(input: unknown): Promise<{ ok: true; result: Awaited<ReturnType<typeof runTurn>> } | ActionError> {
  const parsed = LocalTextTurnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a reply to the caller." };
  try {
    const deps = getRuntimeDeps();
    const record = await deps.store.get(parsed.data.drillId);
    if (!record || record.status !== "live" || record.mode === "practice_call") {
      return { ok: false, error: "This text practice is no longer active. Open its replay or start another call." };
    }
    if (!(await canAccessDrill(record))) return { ok: false, error: "You cannot reply in this practice call." };
    return {
      ok: true,
      result: await runTurn(deps, { drillId: record.id, userText: parsed.data.text, sessionUserId: record.userId ?? undefined }),
    };
  } catch {
    return { ok: false, error: "Your reply could not be saved. Please try again." };
  }
}

async function canAccessDrill(record: DrillRecord): Promise<boolean> {
  if (record.userId === null) return record.mode === "judge" && await hasJudgeSession(record.judgeSessionHash);
  const user = await requireUser();
  return user.id === record.userId;
}

export async function flagTag(input: unknown): Promise<{ ok: true } | ActionError> {
  const parsed = FlagTagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid tag feedback." };
  try {
    const user = await requireUser();
    const [turn] = await db.select({ userId: drills.userId, mode: drills.mode, wallet: drills.wallet, judgeSessionHash: drills.judgeSessionHash })
      .from(turns)
      .innerJoin(drills, eq(turns.drillId, drills.id))
      .where(eq(turns.id, parsed.data.turnId))
      .limit(1);
    const isOwner = turn?.userId === user.id;
    const isJudgeTurn = turn?.userId === null && turn.mode === "judge" && await hasJudgeSession(turn.judgeSessionHash);
    if (!turn || (!isOwner && !isJudgeTurn)) return { ok: false, error: "That turn is unavailable." };
    const reason = parsed.data.reason ? redact(parsed.data.reason, turn.wallet) : null;
    await db.insert(tagFlags).values({ turnId: parsed.data.turnId, userId: user.id, reason });
    return { ok: true };
  } catch {
    return { ok: false, error: "Your feedback could not be saved." };
  }
}
