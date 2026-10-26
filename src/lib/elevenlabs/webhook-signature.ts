import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyElevenLabsWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowMs = Date.now(),
): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signature = parts.find((part) => part.startsWith("v0="));
  if (!timestamp || !/^\d{10,13}$/.test(timestamp) || !signature) return false;

  const timestampMs = Number(timestamp) * (timestamp.length === 10 ? 1000 : 1);
  if (!Number.isFinite(timestampMs) || timestampMs < nowMs - 30 * 60_000 || timestampMs > nowMs + 5 * 60_000) return false;

  const expected = Buffer.from(`v0=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`);
  const supplied = Buffer.from(signature);
  return expected.byteLength === supplied.byteLength && timingSafeEqual(expected, supplied);
}
