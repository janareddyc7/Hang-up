import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyElevenLabsWebhookSignature } from "../src/lib/elevenlabs/webhook-signature";

function headerFor(rawBody: string, secret: string, timestamp: number) {
  const timestampText = String(timestamp);
  const digest = createHmac("sha256", secret).update(`${timestampText}.${rawBody}`).digest("hex");
  return `t=${timestampText},v0=${digest}`;
}

describe("ElevenLabs webhook signature verification", () => {
  const secret = "local-test-secret";
  const now = 1_800_000_000_000;
  const body = JSON.stringify({ type: "post_call_transcription", data: { conversation_id: "conv_test" } });

  it("accepts the signed raw body within the timestamp window", () => {
    expect(verifyElevenLabsWebhookSignature(body, headerFor(body, secret, now / 1000), secret, now)).toBe(true);
  });

  it("rejects modified bodies, stale timestamps and malformed headers", () => {
    const signed = headerFor(body, secret, now / 1000);
    expect(verifyElevenLabsWebhookSignature(`${body} `, signed, secret, now)).toBe(false);
    expect(verifyElevenLabsWebhookSignature(body, headerFor(body, secret, now / 1000 - 1801), secret, now)).toBe(false);
    expect(verifyElevenLabsWebhookSignature(body, `t=${now / 1000},v0=00`, secret, now)).toBe(false);
    expect(verifyElevenLabsWebhookSignature(body, signed, "", now)).toBe(false);
  });
});
