import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { createDrill, DRILL_TTL_MS, finishDrill, handleCustomLlmRequest, InMemoryDrillStore, runTurn, type RuntimeDeps } from "../../src/lib/drill/runtime";
import { DONE_FRAME } from "../../src/lib/llm/sse";
import { DrillVersionConflict } from "../../src/lib/drill/errors";
import { personas } from "../helpers";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};
const textModel = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    }),
  });
const failingModel = () =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error("provider down");
    },
  });

let n = 0;
function deps(over: Partial<RuntimeDeps> = {}): RuntimeDeps {
  return {
    store: new InMemoryDrillStore(),
    personas,
    actorModel: textModel("I understand, but this is a federal matter and I need you to stay with me."),
    classifierModel: textModel(JSON.stringify({ move: "refuse", confidence: 0.9, rationale: "clear no" })),
    llmSecret: "s3cret",
    now: () => 1_000_000 + n++ * 1000,
    newId: () => `id-${n++}`,
    ...over,
  };
}

function post(d: RuntimeDeps, drillId: string, userText: string, auth = "Bearer s3cret", userId: string | undefined = "u1") {
  return handleCustomLlmRequest(
    new Request("http://localhost/api/llm/chat/completions", {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify({
        model: "hang-up-director",
        stream: true,
        messages: [
          { role: "system", content: "ignored" },
          { role: "assistant", content: "Good afternoon..." },
          { role: "user", content: userText },
        ],
        elevenlabs_extra_body: { drill_id: drillId },
        ...(userId ? { user_id: userId } : {}),
      }),
    }),
    d,
  );
}

async function chunks(res: Response) {
  const body = await res.text();
  return body
    .split("\n\n")
    .filter((f) => f.startsWith("data: ") && f !== DONE_FRAME.trim())
    .map((f) => JSON.parse(f.slice(6)));
}

describe("drill runtime", () => {
  it("rejects requests without the shared secret", async () => {
    const d = deps();
    const { drillId } = await createDrill(d, { personaId: "gov-consumer-safety", difficulty: "realistic", userId: "u1" });
    expect((await post(d, drillId, "hi", "Bearer wrong")).status).toBe(401);
  });

  it("creates a drill whose first turn is the persona's first message", async () => {
    const d = deps();
    const created = await createDrill(d, { personaId: "gov-consumer-safety", difficulty: "realistic", userId: "u1" });
    expect(created.firstMessage).toBe(personas.get("gov-consumer-safety")!.firstMessage);
    expect(created.record.turns).toHaveLength(1);
    expect(created.record.state.k).toBe(1);
  });

  it("classifies a refusal and streams a counter-objection voiced by the model", async () => {
    const d = deps();
    const { drillId } = await createDrill(d, { personaId: "gov-consumer-safety", difficulty: "realistic", userId: "u1" });
    const res = await post(d, drillId, "No, I'm not doing that.");
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const text = (await chunks(res)).map((c) => c.choices[0].delta.content ?? "").join("");
    expect(text).toMatch(/federal matter/);
    const rec = (await d.store.get(drillId))!;
    expect(rec.turns.map((t) => t.speaker)).toEqual(["scammer", "user", "scammer"]);
    const user = rec.turns[1]!;
    expect(user.speaker === "user" && user.move).toBe("refuse");
  });

  it("falls back to the scripted line when the model is down", async () => {
    const d = deps({ actorModel: failingModel(), classifierModel: failingModel() });
    const { drillId } = await createDrill(d, { personaId: "gov-consumer-safety", difficulty: "realistic", userId: "u1" });
    await post(d, drillId, "hmm");
    const last = (await d.store.get(drillId))!.turns.at(-1)!;
    expect(last.speaker === "scammer" && last.source).toBe("fallback");
  });

  it("rejects model lines that name real organizations", async () => {
    const d = deps({ actorModel: textModel("This is the FTC, stay on the line.") });
    const { drillId } = await createDrill(d, { personaId: "gov-consumer-safety", difficulty: "realistic", userId: "u1" });
    await post(d, drillId, "Who are you?");
    const last = (await d.store.get(drillId))!.turns.at(-1)!;
    expect(last.speaker === "scammer" && last.source).toBe("fallback");
  });

  it("ends the call through end_call when the user reads the practice code", async () => {
    const d = deps();
    const { drillId, record } = await createDrill(d, { personaId: "bank-fraud-department", difficulty: "realistic", userId: "u2" });
    const res = await post(d, drillId, `sure, it's ${record.wallet.oneTimeCode}`, "Bearer s3cret", "u2");
    const c = await chunks(res);
    expect(c[0].choices[0].delta.tool_calls[0].function.name).toBe("end_call");
    const rec = (await d.store.get(drillId))!;
    expect(rec.status).toBe("ended");
    expect(rec.score?.outcome).toBe("converted");
    // stored text is redacted
    expect(JSON.stringify(rec.turns)).not.toContain(record.wallet.oneTimeCode);
  });

  it("finishDrill scores a live drill once and is idempotent", async () => {
    const d = deps();
    const { drillId } = await createDrill(d, { personaId: "gov-consumer-safety", difficulty: "realistic", userId: "u1" });
    const a = await finishDrill(d, drillId);
    const b = await finishDrill(d, drillId);
    expect(a).toEqual(b);
    expect(a.outcome).toBe("clean_exit");
  });

  it("finishes safely when Hang Up and a webhook race", async () => {
    const d = deps();
    const { drillId } = await createDrill(d, { personaId: "tech-support", difficulty: "easy", userId: "u1" });
    const [first, second] = await Promise.all([finishDrill(d, drillId), finishDrill(d, drillId)]);
    expect(first).toEqual(second);
    expect((await d.store.get(drillId))?.version).toBe(2);
  });

  it("refuses a session whose user does not own the drill", async () => {
    const d = deps();
    const { drillId } = await createDrill(d, { personaId: "gov-consumer-safety", difficulty: "realistic", userId: "u1" });
    const c = await chunks(await post(d, drillId, "hello", "Bearer s3cret", "someone-else"));
    expect(c[0].choices[0].delta.tool_calls[0].function.name).toBe("end_call");
    expect((await d.store.get(drillId))!.turns).toHaveLength(1);
  });

  it("refuses turns after the drill expires", async () => {
    let clock = 0;
    const d = deps({ now: () => clock });
    const { drillId } = await createDrill(d, { personaId: "gov-consumer-safety", difficulty: "realistic", userId: "u1" });
    clock = DRILL_TTL_MS + 1;
    const c = await chunks(await post(d, drillId, "hello"));
    expect(c[0].choices[0].delta.tool_calls[0].function.name).toBe("end_call");
  });

  it("repeats the last line instead of double-stepping on a write conflict", async () => {
    const d = deps();
    const { drillId } = await createDrill(d, { personaId: "gov-consumer-safety", difficulty: "realistic", userId: "u1" });
    const real = d.store;
    let first = true;
    d.store = {
      get: (id) => real.get(id),
      save: async (r) => {
        if (first) { first = false; throw new DrillVersionConflict(); }
        return real.save(r);
      },
    };
    const text = (await chunks(await post(d, drillId, "who is this?"))).map((c) => c.choices[0].delta.content ?? "").join("");
    expect(text).toBe(personas.get("gov-consumer-safety")!.firstMessage);
    expect((await real.get(drillId))!.turns).toHaveLength(1);
  });

  it("runTurn drives a whole text-mode drill without any HTTP", async () => {
    const d = deps({ classifierModel: textModel(JSON.stringify({ move: "comply_minor", confidence: 0.9, rationale: "goes along" })) });
    const { drillId } = await createDrill(d, { personaId: "tech-support", difficulty: "easy", userId: null });
    let result = await runTurn(d, { drillId, userText: "okay, what should I do?" });
    expect(result.kind).toBe("speak");
    result = await runTurn(d, { drillId, userText: "I'm hanging up now" });
    expect(result).toEqual({ kind: "end", reason: "user_hung_up" });
    const rec = (await d.store.get(drillId))!;
    expect(rec.status).toBe("ended");
    expect(rec.score?.outcome).toBeDefined();
  });

  it("ends gracefully when the drill id is unknown", async () => {
    const d = deps();
    const c = await chunks(await post(d, "nope", "hello"));
    expect(c[0].choices[0].delta.tool_calls[0].function.name).toBe("end_call");
  });
});
