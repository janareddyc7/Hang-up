import { describe, expect, it } from "vitest";
import { ClientEnvironmentSchema, parseServerEnvironment } from "@/env-schema";
import { VoiceRoleSchema } from "@/lib/engine/schema";

const voiceIds = Object.fromEntries(
  VoiceRoleSchema.options.map((role) => [role, `voice-${role}`]),
);

describe("environment validation", () => {
  it("uses Vercel's canonical production origin without trusting a request host", () => {
    const environment = parseServerEnvironment({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "hang-up.example.com" });
    expect(environment.APP_URL).toBe("https://hang-up.example.com");
    expect(environment.BETTER_AUTH_URL).toBe(environment.APP_URL);
    expect(parseServerEnvironment({ VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "hang-up.example.com" }).APP_URL).toBe("http://localhost:3000");
  });

  it("preserves explicit deployment origins", () => {
    const environment = parseServerEnvironment({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "hang-up.example.com", APP_URL: "https://custom.example.com", BETTER_AUTH_URL: "https://custom.example.com" });
    expect(environment.APP_URL).toBe("https://custom.example.com");
  });
  it("allows local development before external services are configured", () => {
    const environment = parseServerEnvironment({});

    expect(environment.APP_URL).toBe("http://localhost:3000");
    expect(environment.PRACTICE_CALLS_ENABLED).toBe(false);
    expect(environment.ELEVENLABS_VOICE_IDS).toBeUndefined();
  });

  it("allows the Custom LLM route secret without requiring session credentials", () => {
    const environment = parseServerEnvironment({
      HANGUP_LLM_SECRET: "test-llm-secret",
    });

    expect(environment.HANGUP_LLM_SECRET).toBe("test-llm-secret");
  });

  it("ignores unrelated host environment variables", () => {
    const environment = parseServerEnvironment({
      NODE_ENV: "test",
      PATH: "system-path",
      UNRELATED_SECRET: "not part of this app's configuration",
    });

    expect(environment.APP_URL).toBe("http://localhost:3000");
    expect(environment).not.toHaveProperty("UNRELATED_SECRET");
  });

  it("accepts a complete voice ID mapping for every engine voice role", () => {
    const environment = parseServerEnvironment({
      ELEVENLABS_API_KEY: "test-api-key",
      ELEVENLABS_AGENT_ID: "test-agent",
      ELEVENLABS_WEBHOOK_SECRET: "test-webhook-secret",
      HANGUP_LLM_SECRET: "test-llm-secret",
      ELEVENLABS_VOICE_IDS: JSON.stringify(voiceIds),
    });

    expect(Object.keys(environment.ELEVENLABS_VOICE_IDS ?? {}).sort()).toEqual(
      [...VoiceRoleSchema.options].sort(),
    );
  });

  it("allows voice setup without a post-call webhook secret", () => {
    const environment = parseServerEnvironment({
      ELEVENLABS_API_KEY: "test-api-key",
      ELEVENLABS_AGENT_ID: "test-agent",
      HANGUP_LLM_SECRET: "test-llm-secret",
      ELEVENLABS_VOICE_IDS: JSON.stringify(voiceIds),
    });

    expect(environment.ELEVENLABS_WEBHOOK_SECRET).toBeUndefined();
  });

  it("rejects a voice ID mapping that misses one of the six roles", () => {
    const incomplete = { ...voiceIds };
    delete incomplete.upbeat_host;

    expect(() =>
      parseServerEnvironment({
        ELEVENLABS_API_KEY: "test-api-key",
        ELEVENLABS_AGENT_ID: "test-agent",
        ELEVENLABS_WEBHOOK_SECRET: "test-webhook-secret",
        HANGUP_LLM_SECRET: "test-llm-secret",
        ELEVENLABS_VOICE_IDS: JSON.stringify(incomplete),
      }),
    ).toThrow(/ELEVENLABS_VOICE_IDS:.*upbeat_host/s);
  });

  it("rejects malformed voice JSON with a clear environment error", () => {
    expect(() =>
      parseServerEnvironment({ ELEVENLABS_VOICE_IDS: "not-json" }),
    ).toThrow(/ELEVENLABS_VOICE_IDS: must be valid JSON/);
  });

  it("keeps Practice Calls blocked until the adult-review gate is set", () => {
    const environment = parseServerEnvironment({ PRACTICE_CALLS_ENABLED: "true" });
    expect(environment.PRACTICE_CALLS_ENABLED).toBe(true);
    expect(environment.PRACTICE_CALLS_ADULT_REVIEWED).toBe(false);
  });

  it("requires provider and webhook credentials only after both Practice Call release gates are set", () => {
    expect(() =>
      parseServerEnvironment({ PRACTICE_CALLS_ENABLED: "true", PRACTICE_CALLS_ADULT_REVIEWED: "true" }),
    ).toThrow(/TWILIO_ACCOUNT_SID: is required/);
    expect(() =>
      parseServerEnvironment({ PRACTICE_CALLS_ENABLED: "true", PRACTICE_CALLS_ADULT_REVIEWED: "true" }),
    ).toThrow(/ELEVENLABS_WEBHOOK_SECRET: is required/);
  });

  it("requires a model provider key when model names are configured", () => {
    expect(() =>
      parseServerEnvironment({ ACTOR_MODEL: "test-model" }),
    ).toThrow(/AI_GATEWAY_API_KEY: configure/);
  });

  it("limits browser configuration to the public app URL", () => {
    expect(ClientEnvironmentSchema.shape).toHaveProperty("NEXT_PUBLIC_APP_URL");
    expect(Object.keys(ClientEnvironmentSchema.shape)).toEqual([
      "NEXT_PUBLIC_APP_URL",
    ]);
  });
});
