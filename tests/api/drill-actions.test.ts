import { beforeEach, describe, expect, it, vi } from "vitest";
import { personas } from "../helpers";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireUser: vi.fn(),
  headers: vi.fn(),
  getRuntimeDeps: vi.fn(),
  fetch: vi.fn(),
  ensureJudgeSessionHash: vi.fn(),
  hasJudgeSession: vi.fn(),
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession, requireUser: mocks.requireUser }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/drill/deps", () => ({ getRuntimeDeps: mocks.getRuntimeDeps }));
vi.mock("@/lib/replay/judge-session", () => ({
  ensureJudgeSessionHash: mocks.ensureJudgeSessionHash,
  hasJudgeSession: mocks.hasJudgeSession,
}));
vi.mock("@/env", () => ({
  env: {
    ELEVENLABS_API_KEY: "test-api-key",
    ELEVENLABS_AGENT_ID: "agent-test",
    ELEVENLABS_VOICE_IDS: {
      official_male: "voice-1",
      official_female: "voice-2",
      young_adult_male: "voice-3",
      young_adult_female: "voice-4",
      technician: "voice-5",
      upbeat_host: "voice-6",
    },
  },
}));
vi.mock("@/db/client", () => ({ db: mocks.db }));
vi.mock("@/db/schema", () => ({
  assignments: { id: "assignment.id", traineeId: "assignment.traineeId", personaId: "assignment.personaId", difficulty: "assignment.difficulty" },
  drills: { id: "drill.id" },
  tagFlags: {},
  turns: { id: "turn.id", drillId: "turn.drillId" },
}));

import { attachConversation, finishDrill, localTextTurn, startDrill } from "../../app/actions/drills";
import { createDrill, InMemoryDrillStore, type RuntimeDeps } from "../../src/lib/drill/runtime";

let deps: RuntimeDeps;
let requestIpHeader = "192.0.2.1";

beforeEach(() => {
  vi.clearAllMocks();
  requestIpHeader = `192.0.2.${Math.floor(Math.random() * 200) + 1}`;
  const store = new InMemoryDrillStore();
  deps = {
    store,
    personas,
    actorModel: {} as RuntimeDeps["actorModel"],
    classifierModel: {} as RuntimeDeps["classifierModel"],
    llmSecret: "test-secret",
    now: () => 1_000,
    newId: () => `drl_${crypto.randomUUID()}`,
  };
  mocks.getRuntimeDeps.mockReturnValue(deps);
  mocks.getSession.mockResolvedValue(null);
  mocks.requireUser.mockResolvedValue({ id: "user-1", name: "Test User", email: "test@example.com" });
  mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": requestIpHeader }));
  mocks.ensureJudgeSessionHash.mockResolvedValue("a".repeat(64));
  mocks.hasJudgeSession.mockResolvedValue(true);
  mocks.fetch.mockImplementation(async () => new Response(JSON.stringify({ token: "conversation-token" }), { status: 200 }));
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("drill server actions", () => {
  it("validates start input and rejects caller-supplied identity", async () => {
    const result = await startDrill({
      personaId: "gov-consumer-safety",
      difficulty: "realistic",
      mode: "judge",
      textOnly: false,
      userId: "someone-else",
    });

    expect(result).toEqual({ ok: false, error: "Check the drill details and try again." });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("creates a Judge drill and fetches a voice token server-side", async () => {
    const result = await startDrill({
      personaId: "gov-consumer-safety",
      difficulty: "realistic",
      mode: "judge",
      textOnly: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.connection).toEqual({ conversationToken: "conversation-token" });
    expect(result.voiceId).toBe("voice-1");
    expect(result.sessionUserId).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=agent-test",
      expect.objectContaining({ headers: { "xi-api-key": "test-api-key" } }),
    );
    const record = await deps.store.get(result.drillId);
    expect(record?.mode).toBe("judge");
    expect(record?.userId).toBeNull();
    expect(record?.judgeSessionHash).toBe("a".repeat(64));
  });

  it("requests a signed URL for text-only mode", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ signed_url: "https://api.elevenlabs.io/session" }), { status: 200 }));
    const result = await startDrill({
      personaId: "gov-consumer-safety",
      difficulty: "easy",
      mode: "judge",
      textOnly: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.connection).toEqual({ signedUrl: "https://api.elevenlabs.io/session" });
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=agent-test",
      expect.any(Object),
    );
  });

  it("starts local Judge text without requesting an ElevenLabs session", async () => {
    const result = await startDrill({
      personaId: "gov-consumer-safety",
      difficulty: "realistic",
      mode: "judge",
      textOnly: true,
      offline: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.connection).toBeNull();
    expect(result.offlineFallback).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect((await deps.store.get(result.drillId))?.turns).toHaveLength(1);
  });

  it("keeps Judge practice available when ElevenLabs cannot issue a session", async () => {
    mocks.fetch.mockRejectedValue(new Error("network unavailable"));

    const result = await startDrill({
      personaId: "gov-consumer-safety",
      difficulty: "realistic",
      mode: "judge",
      textOnly: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.connection).toBeNull();
    expect(result.offlineFallback).toBe(true);
    expect((await deps.store.get(result.drillId))?.status).toBe("live");
  });

  it("rejects guest text turns from a different browser session", async () => {
    const created = await createDrill(deps, {
      personaId: "gov-consumer-safety",
      difficulty: "realistic",
      userId: null,
      mode: "judge",
      judgeSessionHash: "a".repeat(64),
    });
    mocks.hasJudgeSession.mockResolvedValue(false);

    const result = await localTextTurn({ drillId: created.drillId, text: "I'm hanging up now." });
    expect(result).toEqual({ ok: false, error: "You cannot reply in this practice call." });
    expect((await deps.store.get(created.drillId))?.turns).toHaveLength(1);
  });

  it("keeps signed-in practice available in local text when the provider is down", async () => {
    mocks.fetch.mockRejectedValue(new Error("provider unavailable"));
    const result = await startDrill({ personaId: "gov-consumer-safety", difficulty: "easy", mode: "sparring", textOnly: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.connection).toBeNull();
    expect(result.offlineFallback).toBe(true);
    const turn = await localTextTurn({ drillId: result.drillId, text: "I'm hanging up now." });
    expect(turn.ok && turn.result.kind).toBe("end");
  });

  it("starts signed-in offline text without a provider session and checks the owner", async () => {
    const result = await startDrill({ personaId: "gov-consumer-safety", difficulty: "easy", mode: "sparring", textOnly: true, offline: true });
    expect(result.ok).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
    if (!result.ok) return;
    mocks.requireUser.mockResolvedValue({ id: "someone-else" });
    expect(await localTextTurn({ drillId: result.drillId, text: "Hello" })).toEqual({ ok: false, error: "You cannot reply in this practice call." });
    expect((await deps.store.get(result.drillId))?.turns).toHaveLength(1);
  });

  it("requires a signed-in user for sparring and takes identity from the session", async () => {
    const result = await startDrill({
      personaId: "gov-consumer-safety",
      difficulty: "realistic",
      mode: "sparring",
      textOnly: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sessionUserId).toBe("user-1");
    const record = await deps.store.get(result.drillId);
    expect(record?.userId).toBe("user-1");
    expect(record?.mode).toBe("sparring");
    expect(mocks.requireUser).toHaveBeenCalledOnce();
  });

  it("enforces the Judge per-IP hourly limit", async () => {
    const input = { personaId: "gov-consumer-safety", difficulty: "easy", mode: "judge", textOnly: false };
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await startDrill(input));

    expect(results.slice(0, 10).every((result) => result.ok)).toBe(true);
    expect(results[10]).toEqual({ ok: false, error: "Too many practice calls. Please try again in an hour." });
    expect(mocks.fetch).toHaveBeenCalledTimes(10);
  });

  it("finishes an owned drill idempotently and returns the score summary", async () => {
    const created = await createDrill(deps, {
      personaId: "gov-consumer-safety",
      difficulty: "realistic",
      userId: "user-1",
    });

    const first = await finishDrill({ drillId: created.drillId });
    const second = await finishDrill({ drillId: created.drillId });
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.score).toHaveProperty("score");
  });

  it("attaches a conversation only to an active drill", async () => {
    const created = await createDrill(deps, {
      personaId: "gov-consumer-safety",
      difficulty: "realistic",
      userId: null,
    });
    const where = vi.fn().mockResolvedValue([]);
    const set = vi.fn(() => ({ where }));
    mocks.db.update.mockReturnValue({ set });

    const result = await attachConversation({ drillId: created.drillId, conversationId: "conv-1" });
    expect(result).toEqual({ ok: true });
    expect(set).toHaveBeenCalledWith({ elevenlabsConversationId: "conv-1" });
  });
});
