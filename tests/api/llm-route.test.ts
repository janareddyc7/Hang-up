import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/llm/chat/completions/route";
import {
  createDrill,
  InMemoryDrillStore,
  type RuntimeDeps,
} from "../../src/lib/drill/runtime";
import { personas } from "../helpers";

const runtimeDepsMock = vi.hoisted(() => ({ getRuntimeDeps: vi.fn() }));
vi.mock("@/lib/drill/deps", () => ({
  getRuntimeDeps: runtimeDepsMock.getRuntimeDeps,
}));

const usage = {
  inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 12, text: 12, reasoning: 0 },
};

function mockModel(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    }),
  });
}

function makeDeps(): RuntimeDeps {
  let id = 0;
  return {
    store: new InMemoryDrillStore(),
    personas,
    actorModel: mockModel("I only need one more detail before you go."),
    classifierModel: mockModel(
      JSON.stringify({ move: "question", confidence: 0.9, rationale: "asks for clarification" }),
    ),
    llmSecret: "route-test-secret",
    now: () => 1_000_000,
    newId: () => `test-${id++}`,
  };
}

function request(drillId: string, text: string, authorization = "Bearer route-test-secret") {
  return new Request("http://localhost/api/llm/chat/completions", {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "hang-up-director",
      stream: true,
      messages: [{ role: "user", content: text }],
      user_id: "route-test-user",
      elevenlabs_extra_body: { drill_id: drillId },
    }),
  });
}

describe("POST /api/llm/chat/completions", () => {
  let deps: RuntimeDeps;

  beforeEach(() => {
    deps = makeDeps();
    runtimeDepsMock.getRuntimeDeps.mockReturnValue(deps);
  });

  it("rejects an incorrect bearer secret", async () => {
    const { drillId } = await createDrill(deps, {
      personaId: "gov-consumer-safety",
      difficulty: "realistic",
      userId: "route-test-user",
    });

    const response = await POST(request(drillId, "Hello", "Bearer incorrect"));
    expect(response.status).toBe(401);
  });

  it("ends cleanly with SSE when persistence is unavailable without exposing error details", async () => {
    deps.store.get = vi.fn().mockRejectedValue(new Error("private database details"));
    const response = await POST(request("unavailable", "private user text"));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('"name":"end_call"');
    expect(body).toContain("service_unavailable");
    expect(body).toContain("data: [DONE]");
    expect(body).not.toContain("private database details");
    expect(body).not.toContain("private user text");
  });

  it("rejects an oversized provider reply before reading or writing a drill", async () => {
    const get = vi.spyOn(deps.store, "get");
    expect((await POST(request("drill", "x".repeat(4001)))).status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  it("streams the Director's answer and persists the turn using mock models", async () => {
    const { drillId } = await createDrill(deps, {
      personaId: "gov-consumer-safety",
      difficulty: "realistic",
      userId: "route-test-user",
    });

    const response = await POST(request(drillId, "What do you mean by that?"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const streamedText = body
      .split("\n\n")
      .filter((frame) => frame.startsWith("data: {") && frame.includes('"choices"'))
      .map((frame) => JSON.parse(frame.slice(6)) as {
        choices: Array<{ delta: { content?: string } }>;
      })
      .map((chunk) => chunk.choices[0]?.delta.content ?? "")
      .join("");
    expect(streamedText).toBe("I only need one more detail before you go.");
    expect(body.trimEnd().endsWith("data: [DONE]")).toBe(true);

    const record = await deps.store.get(drillId);
    expect(record?.turns.map((turn) => turn.speaker)).toEqual([
      "scammer",
      "user",
      "scammer",
    ]);
    const userTurn = record?.turns[1];
    expect(userTurn?.speaker === "user" ? userTurn.move : undefined).toBe("question");
  });
});
