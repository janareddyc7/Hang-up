"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { env } from "@/env";
import { db } from "@/db/client";
import { practiceCallConsents } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { encryptPhone } from "@/lib/practice-calls/security";
import { revokePracticeCallsForUser } from "@/lib/practice-calls/revoke";
import { PRACTICE_CALL_CONSENT_VERSION } from "@/lib/practice-calls/consent";

const PhoneSchema = z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Enter a phone number in international format, such as +14155552671.");
const BeginSchema = z.object({ phoneE164: PhoneSchema }).strict();
const ConsentSchema = z.object({
  phoneE164: PhoneSchema,
  code: z.string().trim().regex(/^\d{4,10}$/),
  consentTextVersion: z.literal(PRACTICE_CALL_CONSENT_VERSION),
  accepted: z.literal(true),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  windowStartMinute: z.number().int().min(8 * 60).max(20 * 60),
  windowEndMinute: z.number().int().min(9 * 60).max(21 * 60),
  timezone: z.string().trim().min(1).max(64),
  maxPerWeek: z.union([z.literal(1), z.literal(2), z.literal(3)]),
}).strict().refine((value) => value.windowStartMinute < value.windowEndMinute, "Choose a valid time window.")
  .refine((value) => new Set(value.daysOfWeek).size === value.daysOfWeek.length, "Choose each day once.");

const verifyAttempts = new Map<string, { startedAt: number; count: number }>();

function enabledError() {
  return { ok: false as const, error: "Scheduled practice calls are off. They must be reviewed before an adult enables them." };
}

function accountAuthorization() {
  return `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`;
}

export async function beginPhoneVerification(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!env.PRACTICE_CALLS_ENABLED || !env.PRACTICE_CALLS_ADULT_REVIEWED) return enabledError();
  const parsed = BeginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter your phone number." };
  const trainee = await requireUser();
  const now = Date.now();
  const prior = verifyAttempts.get(trainee.id);
  if (prior && now - prior.startedAt < 60 * 60 * 1000 && prior.count >= 3) {
    return { ok: false, error: "For your safety, wait an hour before requesting another code." };
  }
  verifyAttempts.set(trainee.id, !prior || now - prior.startedAt >= 60 * 60 * 1000
    ? { startedAt: now, count: 1 }
    : { ...prior, count: prior.count + 1 });
  try {
    const response = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(env.TWILIO_VERIFY_SERVICE_SID!)}/Verifications`, {
      method: "POST",
      headers: { Authorization: accountAuthorization(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: parsed.data.phoneE164, Channel: "sms" }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const result: unknown = await response.json();
    if (!response.ok || !z.object({ status: z.string().optional() }).safeParse(result).success) {
      return { ok: false, error: "A verification code could not be sent. Check the number and try again." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "A verification code could not be sent. Please try again." };
  }
}

export async function confirmPracticeCalls(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!env.PRACTICE_CALLS_ENABLED || !env.PRACTICE_CALLS_ADULT_REVIEWED) return enabledError();
  const parsed = ConsentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Review the consent and schedule." };
  const trainee = await requireUser();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone });
  } catch {
    return { ok: false, error: "Choose a valid time zone." };
  }
  try {
    const response = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(env.TWILIO_VERIFY_SERVICE_SID!)}/VerificationCheck`, {
      method: "POST",
      headers: { Authorization: accountAuthorization(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: parsed.data.phoneE164, Code: parsed.data.code }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const verification: unknown = await response.json();
    if (!response.ok || !z.object({ status: z.literal("approved") }).safeParse(verification).success) {
      return { ok: false, error: "That code did not verify. Request a new code and try again." };
    }
    const phoneE164Encrypted = encryptPhone(parsed.data.phoneE164, env.PHONE_ENCRYPTION_KEY!);
    const consent = {
      userId: trainee.id,
      phoneE164Encrypted,
      phoneVerifiedAt: new Date(),
      consentTextVersion: parsed.data.consentTextVersion,
      consentedAt: new Date(),
      daysOfWeek: parsed.data.daysOfWeek,
      windowStartMinute: parsed.data.windowStartMinute,
      windowEndMinute: parsed.data.windowEndMinute,
      timezone: parsed.data.timezone,
      maxPerWeek: parsed.data.maxPerWeek,
      revokedAt: null,
    };
    await db.insert(practiceCallConsents).values(consent).onConflictDoUpdate({
      target: practiceCallConsents.userId,
      set: consent,
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch {
    return { ok: false, error: "Your verified consent could not be saved. Please try again." };
  }
}

export async function revokePracticeCalls(): Promise<{ ok: true } | { ok: false; error: string }> {
  const trainee = await requireUser();
  try {
    await revokePracticeCallsForUser(trainee.id, true);
    revalidatePath("/settings");
    return { ok: true };
  } catch {
    return { ok: false, error: "Your Practice Calls consent could not be removed. Please try again." };
  }
}
