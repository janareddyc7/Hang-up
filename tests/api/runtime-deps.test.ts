import { beforeAll, describe, expect, it } from "vitest";
import { VoiceRoleSchema } from "../../src/lib/engine/schema";

// This suite verifies construction only. Never load .env.local or open a remote DB here.
process.env.DATABASE_URL = "postgres://hangup:hangup@127.0.0.1:5432/hangup";
process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
process.env.AI_GATEWAY_API_KEY ??= "test-ai-gateway-key";
process.env.HANGUP_LLM_SECRET = "test-hangup-llm-secret";
process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
process.env.ELEVENLABS_AGENT_ID = "test-agent-id";
process.env.ELEVENLABS_WEBHOOK_SECRET = "test-webhook-secret";
process.env.ELEVENLABS_VOICE_IDS = JSON.stringify(
  Object.fromEntries(VoiceRoleSchema.options.map((role) => [role, `test-${role}`])),
);

describe("runtime dependencies", () => {
  let getRuntimeDeps: typeof import("../../src/lib/drill/deps").getRuntimeDeps;

  beforeAll(async () => {
    ({ getRuntimeDeps } = await import("../../src/lib/drill/deps"));
  });

  it("memoizes the Drizzle store, all validated personas, and configured Gateway models", () => {
    const first = getRuntimeDeps();
    const second = getRuntimeDeps();

    expect(second).toBe(first);
    expect(first.personas.size).toBe(6);
    expect(first.personas.has("gov-consumer-safety")).toBe(true);
    expect(first.actorModel).toHaveProperty("modelId", "openai/gpt-4.1-mini");
    expect(first.classifierModel).toHaveProperty("modelId", "openai/gpt-4.1-nano");
    expect(first.llmSecret).toBe("test-hangup-llm-secret");
    expect(first.newId()).toMatch(/^drl_[0-9a-f-]{36}$/);
  });
});
