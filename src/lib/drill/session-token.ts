import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const SessionSchema = z.object({
  drillId: z.string().min(1).max(100),
  userId: z.string().min(1).max(200).nullable(),
  expiresAt: z.number().int().positive(),
}).strict();
type DrillSession = z.infer<typeof SessionSchema>;

/** A short-lived capability for this drill only; never exposes the signing key. */
export function mintDrillSession(secret: string, session: DrillSession): string {
  const payload = Buffer.from(JSON.stringify(SessionSchema.parse(session))).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyDrillSession(secret: string, token: string, now: number): DrillSession | null {
  if (token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const parsed = SessionSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return parsed.success && parsed.data.expiresAt > now ? parsed.data : null;
  } catch {
    return null;
  }
}
