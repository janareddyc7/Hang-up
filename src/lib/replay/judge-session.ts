import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "hangup-judge-session";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const SESSION_MAX_AGE_SECONDS = 8 * 24 * 60 * 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates one private browser session and returns only its database-safe hash. */
export async function ensureJudgeSessionHash(): Promise<string> {
  const cookieStore = await cookies();
  let token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token || !TOKEN_PATTERN.test(token)) {
    token = randomBytes(32).toString("base64url");
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  }
  return hashToken(token);
}

/** Checks the browser session without creating a new one for an unauthorized request. */
export async function hasJudgeSession(storedHash: string | null | undefined): Promise<boolean> {
  if (!storedHash || !HASH_PATTERN.test(storedHash)) return false;
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || !TOKEN_PATTERN.test(token)) return false;
  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hashToken(token), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
