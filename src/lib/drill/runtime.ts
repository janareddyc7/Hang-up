/**
 * Drill runtime: create a drill, handle each ElevenLabs Custom LLM request, finish and score.
 *
 * The Next.js route `app/api/llm/chat/completions/route.ts` should be a thin wrapper:
 *
 *   export const runtime = "nodejs";
 *   export const dynamic = "force-dynamic";
 *   export async function POST(req: Request) {
 *     return handleCustomLlmRequest(req, getRuntimeDeps());
 *   }
 */
import type { LanguageModel } from "ai";
import { buildActorPrompt, validateLine } from "../engine/actor";
import { initialState, openingAction, step, type DirectorAction, type DrillState } from "../engine/director";
import { decideByRules, isPracticeStopPhrase } from "../engine/moves";
import type { Difficulty, EndReason, PersonaCard, PracticeWallet, ScammerTurn, Turn, UserTurn } from "../engine/schema";
import { scoreDrill, type ScoreResult } from "../engine/scoring";
import { generateWallet, redact } from "../engine/wallet";
import { classifyMove, writeLine } from "../llm/models";
import { logDrillEvent } from "../observability/log";
import { DrillVersionConflict } from "./errors";
import { assessmentPersona } from "../pilot/costume";
import { verifyDrillSession } from "./session-token";
import {
  CustomLlmRequestSchema,
  endCallFrames,
  latestUserText,
  sseResponse,
  textFrames,
  type CustomLlmRequest,
} from "../llm/sse";

/** A drill accepts turns only this long after it starts. */
export const DRILL_TTL_MS = 15 * 60 * 1000;

export interface DrillRecord {
  id: string;
  userId: string | null;
  /** Hash of the browser session that owns an anonymous Judge drill. */
  judgeSessionHash?: string;
  /** Product flow that created this drill; older in-memory fixtures may omit it. */
  mode?: "judge" | "sparring" | "assigned" | "group" | "practice_call";
  assignmentId?: string;
  isAssessment?: boolean;
  personaId: string;
  difficulty: Difficulty;
  seed: string;
  wallet: PracticeWallet;
  state: DrillState;
  turns: Turn[];
  startedAtMs: number;
  status: "live" | "ended";
  endReason?: EndReason;
  score?: ScoreResult;
  /** Incremented on every save; use it for optimistic concurrency in the database. */
  version: number;
}

export interface DrillStore {
  get(id: string): Promise<DrillRecord | null>;
  /** Must fail if `record.version - 1` is not the stored version (optimistic lock). */
  save(record: DrillRecord): Promise<void>;
  /** Optional atomic finish path for stores that apply curriculum updates with the final score. */
  finalize?(record: DrillRecord, nowMs: number): Promise<void>;
}

export interface RuntimeDeps {
  store: DrillStore;
  personas: ReadonlyMap<string, PersonaCard>;
  actorModel: LanguageModel;
  classifierModel: LanguageModel;
  /** Shared secret ElevenLabs sends as `Authorization: Bearer ...` (set as the Custom LLM API key secret). */
  llmSecret: string;
  now: () => number;
  newId: () => string;
  /** Deletes a Practice Call consent and cancels queued calls after the caller says stop. */
  onPracticeCallStop?: (userId: string) => Promise<void>;
}

export class InMemoryDrillStore implements DrillStore {
  private rows = new Map<string, DrillRecord>();
  async get(id: string) {
    const r = this.rows.get(id);
    return r ? structuredClone(r) : null;
  }
  async save(record: DrillRecord) {
    const prev = this.rows.get(record.id);
    if (prev && prev.version !== record.version - 1) throw new DrillVersionConflict();
    this.rows.set(record.id, structuredClone(record));
  }
}

export interface CreatedDrill {
  record: DrillRecord;
  /** Pass to ElevenLabs as dynamicVariables.first_message. */
  firstMessage: string;
  /** Pass to ElevenLabs as custom LLM extra body / dynamic variable `drill_id`. */
  drillId: string;
  voiceRole: PersonaCard["voiceRole"];
  callerIdDisplay: string;
}

export async function createDrill(
  deps: Pick<RuntimeDeps, "store" | "personas" | "now" | "newId">,
  opts: { personaId: string; difficulty: Difficulty; userId: string | null; mode?: DrillRecord["mode"]; assignmentId?: string; seed?: string; judgeSessionHash?: string; isAssessment?: boolean },
): Promise<CreatedDrill> {
  let persona = deps.personas.get(opts.personaId);
  if (!persona) throw new Error(`unknown persona ${opts.personaId}`);
  const id = deps.newId();
  const seed = opts.seed ?? id;
  if (opts.isAssessment) persona = assessmentPersona(persona, seed);
  const opened = openingAction(initialState(persona, opts.difficulty, seed), persona);
  if (opened.action.kind !== "speak") throw new Error("opening must speak");
  const firstTurn: ScammerTurn = {
    speaker: "scammer",
    k: opened.action.k,
    stage: opened.action.stage,
    tactics: opened.action.tactics,
    text: persona.firstMessage,
    source: "first_message",
    tMs: 0,
  };
  const record: DrillRecord = {
    id,
    userId: opts.userId,
    mode: opts.mode ?? (opts.userId === null ? "judge" : "sparring"),
    personaId: persona.id,
    difficulty: opts.difficulty,
    seed,
    wallet: generateWallet(opts.userId ?? seed),
    state: opened.state,
    turns: [firstTurn],
    startedAtMs: deps.now(),
    status: "live",
    version: 1,
  };
  if (opts.judgeSessionHash) record.judgeSessionHash = opts.judgeSessionHash;
  if (opts.assignmentId) record.assignmentId = opts.assignmentId;
  if (opts.isAssessment) record.isAssessment = true;
  await deps.store.save(record);
  return {
    record,
    firstMessage: persona.firstMessage,
    drillId: id,
    voiceRole: persona.voiceRole,
    callerIdDisplay: persona.callerIdDisplay,
  };
}

function meta(req: CustomLlmRequest, deps: RuntimeDeps) {
  return { id: deps.newId(), model: req.model };
}

function drillIdFrom(req: CustomLlmRequest): string | null {
  const v = req.elevenlabs_extra_body?.["drill_id"];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export type TurnResult =
  | { kind: "speak"; text: string }
  | { kind: "end"; reason: EndReason | "no_active_drill" | "conflict"; line?: string };

/**
 * One user turn, transport-agnostic. Used by the ElevenLabs route, the offline
 * text fallback (Judge mode without ElevenLabs) and the bot harness.
 */
export async function runTurn(
  deps: RuntimeDeps,
  input: { drillId: string | null; userText: string; sessionUserId?: string | undefined },
): Promise<TurnResult> {
  const turnStartedAt = Date.now();
  const record = input.drillId ? await deps.store.get(input.drillId) : null;
  const basePersona = record ? deps.personas.get(record.personaId) : undefined;
  const persona = record?.isAssessment && basePersona ? assessmentPersona(basePersona, record.seed) : basePersona;
  const expired = record ? deps.now() - record.startedAtMs > DRILL_TTL_MS : false;
  // The signed session carries the owner even when the provider omits user_id.
  const wrongUser = record?.userId != null && input.sessionUserId !== record.userId;
  if (!record || !persona || record.status !== "live" || expired || wrongUser) {
    if (input.drillId) console.warn(JSON.stringify({
      event: "drill.binding.rejected",
      reason: !record ? "missing_drill" : !persona ? "missing_persona" : record.status !== "live" ? "not_live" : expired ? "expired" : "owner_mismatch",
      timestamp: new Date().toISOString(),
    }));
    return { kind: "end", reason: "no_active_drill", line: "Sorry, wrong number." };
  }

  const nowMs = deps.now() - record.startedAtMs;
  const rawText = input.userText;
  const e2eMode = process.env.HANGUP_E2E_MODE === "true" && process.env.NODE_ENV !== "production";
  const lastScammer = [...record.turns].reverse().find((t): t is ScammerTurn => t.speaker === "scammer");

  // 1. Decide the user's move: exact rules first, then the classifier.
  const practiceStop = record.mode === "practice_call" && isPracticeStopPhrase(rawText);
  const ruled = decideByRules(rawText, record.wallet, record.mode === "practice_call" ? "practice_call" : undefined);
  const decision = ruled
    ? { move: ruled.move, confidence: ruled.confidence, decidedBy: "rule" as const }
    : e2eMode
      ? { move: "comply_minor" as const, confidence: 1, decidedBy: "classifier" as const }
    : rawText.trim()
      ? await classifyMove({ model: deps.classifierModel, userText: redact(rawText, record.wallet), lastCallerLine: lastScammer?.text ?? "" })
      : { move: "unclear" as const, confidence: 0, decidedBy: "fallback" as const };

  const userTurn: UserTurn = {
    speaker: "user",
    afterK: record.state.k,
    text: redact(rawText, record.wallet),
    move: decision.move,
    confidence: decision.confidence,
    decidedBy: decision.decidedBy,
    tMs: nowMs,
  };

  // 2. Let the Director decide what happens next.
  const { state, action } = step(record.state, persona, decision.move);
  const turns: Turn[] = [...record.turns, userTurn];

  if (action.kind === "end") {
    if (action.line) {
      turns.push({ speaker: "scammer", k: state.k + 1, stage: state.stage, tactics: action.tactics, text: action.line, source: "farewell", tMs: nowMs });
    }
    const ended: DrillRecord = { ...record, state, turns, status: "ended", endReason: action.reason, version: record.version + 1 };
    ended.score = scoreDrill(turns, action.reason);
    if (!(await trySave(deps, ended))) return replayLastLine(deps, record.id);
    if (practiceStop && record.userId && deps.onPracticeCallStop) {
      try {
        await deps.onPracticeCallStop(record.userId);
      } catch {
        // The call still ends immediately; an allowlist error event lets ops investigate revocation failures.
        console.error(JSON.stringify({
          event: "practice_call.revocation_failed",
          drillId: record.id,
          timestamp: new Date().toISOString(),
        }));
      }
    }
    logDrillEvent({ event: "drill.turn.completed", drillId: record.id, move: decision.move, decidedBy: decision.decidedBy, durationMs: Date.now() - turnStartedAt });
    const result: TurnResult = { kind: "end", reason: action.reason };
    if (action.line) result.line = action.line;
    return result;
  }

  // 3. Have the Actor voice the decision; fall back to the scripted line if anything is off.
  const line = e2eMode
    ? { text: action.fallbackLine, source: "fallback" as const }
    : await voice(deps, persona, record, action, turns);
  turns.push({
    speaker: "scammer",
    k: action.k,
    stage: action.stage,
    tactics: action.tactics,
    text: line.text,
    source: line.source,
    tMs: deps.now() - record.startedAtMs,
  });
  if (!(await trySave(deps, { ...record, state, turns, version: record.version + 1 }))) {
    return replayLastLine(deps, record.id);
  }
  logDrillEvent({ event: "drill.turn.completed", drillId: record.id, move: decision.move, decidedBy: decision.decidedBy, durationMs: Date.now() - turnStartedAt });
  return { kind: "speak", text: line.text };
}

/** Handles one ElevenLabs Custom LLM request (one user turn). Always answers with SSE once authenticated. */
export async function handleCustomLlmRequest(request: Request, deps: RuntimeDeps): Promise<Response> {
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${deps.llmSecret}`) return new Response("unauthorized", { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const parsed = CustomLlmRequestSchema.safeParse(body);
  if (!parsed.success) return new Response("invalid request", { status: 400 });
  const req = parsed.data;
  const m = meta(req, deps);

  const userText = latestUserText(req) ?? "";
  if (userText.length > 4000) return new Response("reply too long", { status: 400 });
  const drillId = drillIdFrom(req);
  const token = req.elevenlabs_extra_body?.["session_token"];
  const session = typeof token === "string" ? verifyDrillSession(deps.llmSecret, token, deps.now()) : null;
  if (token !== undefined && (!session || session.drillId !== drillId)) {
    return sseResponse(endCallFrames(m, "invalid_session", "Please start a new practice call from the app."));
  }
  try {
    const result = await runTurn(deps, {
      drillId,
      userText,
      sessionUserId: session ? session.userId ?? undefined : req.user_id,
    });
    return sseResponse(result.kind === "speak" ? textFrames(m, result.text) : endCallFrames(m, result.reason, result.line));
  } catch {
    // Keep the provider protocol valid on database outages. Do not log the request or error text.
    console.error(JSON.stringify({ event: "drill.turn.failed", timestamp: new Date().toISOString() }));
    return sseResponse(endCallFrames(m, "service_unavailable", "Practice has paused because the connection was lost. Please return to the app."));
  }
}

async function trySave(deps: RuntimeDeps, record: DrillRecord): Promise<boolean> {
  try {
    await deps.store.save(record);
    return true;
  } catch (error) {
    if (error instanceof DrillVersionConflict) return false;
    throw error;
  }
}

/** On a write conflict, repeat what the scammer last said instead of stepping twice. */
async function replayLastLine(deps: RuntimeDeps, drillId: string): Promise<TurnResult> {
  const fresh = await deps.store.get(drillId);
  const last = fresh ? [...fresh.turns].reverse().find((t): t is ScammerTurn => t.speaker === "scammer") : undefined;
  if (!fresh || fresh.status !== "live" || !last) return { kind: "end", reason: "conflict" };
  return { kind: "speak", text: last.text };
}

async function voice(
  deps: RuntimeDeps,
  persona: PersonaCard,
  record: DrillRecord,
  action: Extract<DirectorAction, { kind: "speak" }>,
  turns: Turn[],
): Promise<{ text: string; source: "model" | "fallback" }> {
  const prompt = buildActorPrompt({ persona, difficulty: record.difficulty, action, recentTurns: turns, wallet: record.wallet });
  const raw = await writeLine(deps.actorModel, prompt);
  if (raw) {
    const check = validateLine(raw);
    if (check.ok) return { text: check.line, source: "model" };
  }
  return { text: action.fallbackLine, source: "fallback" };
}

/** Called when the user presses Hang Up (or from the post-call webhook). Idempotent. */
export async function finishDrill(
  deps: Pick<RuntimeDeps, "store" | "now">,
  drillId: string,
  reason: EndReason = "user_hung_up",
): Promise<ScoreResult> {
  // A last transcript, webhook, and Hang Up can arrive together. Reload only on a real lock conflict.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await finishOnce(deps, drillId, reason);
    } catch (error) {
      if (!(error instanceof DrillVersionConflict) || attempt === 2) throw error;
    }
  }
  throw new DrillVersionConflict();
}

async function finishOnce(
  deps: Pick<RuntimeDeps, "store" | "now">,
  drillId: string,
  reason: EndReason,
): Promise<ScoreResult> {
  const record = await deps.store.get(drillId);
  if (!record) throw new Error(`unknown drill ${drillId}`);
  if (record.status === "ended" && record.score) {
    await deps.store.finalize?.(record, deps.now());
    return record.score;
  }
  const endReason = record.endReason ?? reason;
  const score = scoreDrill(record.turns, endReason);
  const finished: DrillRecord = {
    ...record,
    status: "ended",
    endReason,
    state: { ...record.state, ended: true, endReason },
    score,
    version: record.version + 1,
  };
  if (deps.store.finalize) await deps.store.finalize(finished, deps.now());
  else await deps.store.save(finished);
  return score;
}
