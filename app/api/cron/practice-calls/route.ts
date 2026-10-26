import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { db } from "@/db/client";
import { drills, itemDifficulty as itemDifficultyTable, practiceCallConsents, practiceCalls, skills } from "@/db/schema";
import { getRuntimeDeps } from "@/lib/drill/deps";
import { createDrill } from "@/lib/drill/runtime";
import { TacticSchema } from "@/lib/engine/schema";
import { DIFFICULTY_BASE, type ItemDifficulty, type SkillRow } from "@/lib/engine/skills";
import { decryptPhone, isWithinPracticeWindow, localDateKey } from "@/lib/practice-calls/security";
import { terminateTwilioCall } from "@/lib/practice-calls/twilio";
import { recommendPractice } from "@/lib/practice/recommend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OutboundResultSchema = z.object({
  success: z.boolean(),
  conversation_id: z.string().min(1).optional().nullable(),
  callSid: z.string().min(1).optional().nullable(),
}).passthrough();

async function recommendationFor(userId: string, nowMs: number) {
  const [skillRows, finished, itemRows] = await Promise.all([
    db.select().from(skills).where(eq(skills.userId, userId)),
    db.select({ id: drills.id }).from(drills).where(and(eq(drills.userId, userId), eq(drills.status, "ended"))),
    db.select().from(itemDifficultyTable),
  ]);
  const skillList: SkillRow[] = skillRows.flatMap((row) => {
    const tactic = TacticSchema.safeParse(row.tactic);
    return tactic.success
      ? [{ tactic: tactic.data, theta: row.theta, box: row.box, dueAtMs: row.dueAt.getTime(), ...(row.lastPersonaId ? { lastPersonaId: row.lastPersonaId } : {}) }]
      : [];
  });
  const itemMap = new Map(itemRows.map((row) => [`${row.personaId}:${row.tactic}:${row.difficulty}`, row.d] as const));
  const itemDifficulty: ItemDifficulty = (personaId, tactic, difficulty) =>
    itemMap.get(`${personaId}:${tactic}:${difficulty}`) ?? DIFFICULTY_BASE[difficulty];
  const deps = getRuntimeDeps();
  return recommendPractice({
    completedDrills: finished.length,
    personas: [...deps.personas.values()],
    skills: skillList,
    nowMs,
    itemDifficulty,
  });
}

export async function GET(request: Request) {
  if (!env.CRON_SECRET) return NextResponse.json({ error: "Cron job is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  if (!dryRun && (!env.PRACTICE_CALLS_ENABLED || !env.PRACTICE_CALLS_ADULT_REVIEWED)) {
    return NextResponse.json({ error: "Practice Calls are not enabled for release." }, { status: 503 });
  }
  if (!dryRun && (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_AGENT_ID || !env.ELEVENLABS_PHONE_NUMBER_ID || !env.ELEVENLABS_VOICE_IDS || !env.PHONE_ENCRYPTION_KEY)) {
    return NextResponse.json({ error: "Practice Call provider setup is incomplete." }, { status: 503 });
  }

  const now = new Date();
  const candidates = await db.select().from(practiceCallConsents)
    .where(and(isNull(practiceCallConsents.revokedAt), gte(practiceCallConsents.phoneVerifiedAt, new Date(0))));
  if (dryRun) {
    let previews = 0;
    for (const consent of candidates) {
      if (!consent.phoneVerifiedAt || !isWithinPracticeWindow(consent, now)) continue;
      const localDay = localDateKey(consent.timezone, now);
      if (!localDay) continue;
      const recent = await db.select({ scheduledFor: practiceCalls.scheduledFor }).from(practiceCalls).where(and(
        eq(practiceCalls.userId, consent.userId),
        gte(practiceCalls.scheduledFor, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
      ));
      if (recent.some((call) => localDateKey(consent.timezone, call.scheduledFor) === localDay)
        || recent.length >= consent.maxPerWeek) continue;
      const choice = await recommendationFor(consent.userId, now.getTime());
      const deps = getRuntimeDeps();
      const persona = choice ? deps.personas.get(choice.personaId) : undefined;
      const voiceId = persona && env.ELEVENLABS_VOICE_IDS?.[persona.voiceRole];
      if (!choice || !persona || !voiceId) continue;
      // This is a reviewable payload shape, with phone and account identifiers redacted. Nothing is sent or written.
      console.info(JSON.stringify({
        event: "practice_call.dry_run",
        payload: {
          agent_id: env.ELEVENLABS_AGENT_ID ?? "[not configured]",
          agent_phone_number_id: env.ELEVENLABS_PHONE_NUMBER_ID ?? "[not configured]",
          to_number: "[REDACTED]",
          call_recording_enabled: false,
          conversation_initiation_client_data: {
            user_id: "[REDACTED]",
            custom_llm_extra_body: { drill_id: "drl_dry_run" },
            conversation_config_override: {
              agent: { first_message: `This is a Hang Up practice call. Say stop practice at any time to end it. ${persona.firstMessage}` },
              tts: { voice_id: voiceId },
            },
          },
        },
      }));
      previews += 1;
    }
    return NextResponse.json({ dryRun: true, eligibleSchedules: previews, callsPlaced: 0 });
  }

  let placed = 0;
  let skipped = 0;
  for (const consent of candidates) {
    if (!consent.phoneVerifiedAt || !isWithinPracticeWindow(consent, now)) {
      skipped += 1;
      continue;
    }
    const localDay = localDateKey(consent.timezone, now);
    if (!localDay) { skipped += 1; continue; }

    let reservation: { callId: string; drillId: string; firstMessage: string; voiceId: string } | null = null;
    try {
      reservation = await db.transaction(async (tx) => {
        // Vercel cron runs can overlap. Serialize per trainee before checking weekly limits and reserving a call.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${consent.userId}, 0))`);
        const [currentConsent] = await tx.select().from(practiceCallConsents).where(and(
          eq(practiceCallConsents.userId, consent.userId),
          isNull(practiceCallConsents.revokedAt),
        )).limit(1);
        if (!currentConsent?.phoneVerifiedAt || !isWithinPracticeWindow(currentConsent, now)) return null;

        const recent = await tx.select({ scheduledFor: practiceCalls.scheduledFor })
          .from(practiceCalls).where(and(
            eq(practiceCalls.userId, consent.userId),
            gte(practiceCalls.scheduledFor, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
          ));
        if (recent.some((call) => localDateKey(currentConsent.timezone, call.scheduledFor) === localDay)
          || recent.length >= currentConsent.maxPerWeek) return null;

        const choice = await recommendationFor(consent.userId, now.getTime());
        if (!choice) return null;
        const deps = getRuntimeDeps();
        const persona = deps.personas.get(choice.personaId);
        const voiceId = persona && env.ELEVENLABS_VOICE_IDS?.[persona.voiceRole];
        if (!persona || !voiceId) return null;
        const created = await createDrill(deps, {
          personaId: choice.personaId,
          difficulty: choice.difficulty,
          userId: consent.userId,
          mode: "practice_call",
        });
        const callId = `pc_${crypto.randomUUID()}`;
        await tx.insert(practiceCalls).values({
          id: callId,
          userId: consent.userId,
          drillId: created.drillId,
          scheduledFor: now,
          status: "placing",
        });
        return {
          callId,
          drillId: created.drillId,
          firstMessage: `This is a Hang Up practice call. Say stop practice at any time to end it. ${created.firstMessage}`,
          voiceId,
        };
      });
    } catch {
      skipped += 1;
      continue;
    }
    if (!reservation) { skipped += 1; continue; }

    try {
      const phone = decryptPhone(consent.phoneE164Encrypted, env.PHONE_ENCRYPTION_KEY!);
      const payload = {
        agent_id: env.ELEVENLABS_AGENT_ID,
        agent_phone_number_id: env.ELEVENLABS_PHONE_NUMBER_ID,
        to_number: phone,
        call_recording_enabled: false,
        conversation_initiation_client_data: {
          user_id: consent.userId,
          custom_llm_extra_body: { drill_id: reservation.drillId },
          conversation_config_override: {
            agent: { first_message: reservation.firstMessage },
            tts: { voice_id: reservation.voiceId },
          },
        },
      };
      const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
        method: "POST",
        headers: { "xi-api-key": env.ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      const result = OutboundResultSchema.safeParse(await response.json());
      if (!response.ok || !result.success || !result.data.success) throw new Error("Outbound call request failed.");
      if (!result.data.conversation_id) {
        if (result.data.callSid) await terminateTwilioCall(result.data.callSid);
        throw new Error("Outbound call could not be linked to its drill.");
      }
      const stillConsented = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${consent.userId}, 0))`);
        const [activeConsent] = await tx.select({ userId: practiceCallConsents.userId }).from(practiceCallConsents).where(and(
          eq(practiceCallConsents.userId, consent.userId),
          isNull(practiceCallConsents.revokedAt),
        )).limit(1);
        const [reservedCall] = await tx.select({ status: practiceCalls.status }).from(practiceCalls)
          .where(eq(practiceCalls.id, reservation!.callId)).limit(1);
        if (!activeConsent || reservedCall?.status !== "placing") {
          await tx.update(practiceCalls).set({ status: "stopped" }).where(and(
            eq(practiceCalls.id, reservation!.callId),
            eq(practiceCalls.status, "placing"),
          ));
          return false;
        }
        await tx.update(practiceCalls).set({
          status: "placed",
          placedAt: new Date(),
          elevenlabsConversationId: result.data.conversation_id ?? null,
          twilioCallSid: result.data.callSid ?? null,
        }).where(eq(practiceCalls.id, reservation!.callId));
        if (result.data.conversation_id) {
          await tx.update(drills).set({ elevenlabsConversationId: result.data.conversation_id })
            .where(eq(drills.id, reservation!.drillId));
        }
        return true;
      });
      if (stillConsented) placed += 1;
      else {
        if (result.data.callSid) await terminateTwilioCall(result.data.callSid);
        skipped += 1;
      }
    } catch {
      await db.transaction(async (tx) => {
        await tx.update(practiceCalls).set({ status: "failed" }).where(eq(practiceCalls.id, reservation!.callId));
        await tx.delete(drills).where(and(eq(drills.id, reservation!.drillId), eq(drills.mode, "practice_call")));
      });
      skipped += 1;
    }
  }

  return NextResponse.json({ processed: candidates.length, placed, skipped });
}
