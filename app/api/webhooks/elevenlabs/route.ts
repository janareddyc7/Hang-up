import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { db } from "@/db/client";
import { drills, practiceCalls } from "@/db/schema";
import { getRuntimeDeps } from "@/lib/drill/deps";
import { finishDrill } from "@/lib/drill/runtime";
import { verifyElevenLabsWebhookSignature } from "@/lib/elevenlabs/webhook-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EventSchema = z.object({
  type: z.enum(["post_call_transcription", "call_initiation_failure", "post_call_audio"]),
  data: z.object({
    conversation_id: z.string().min(1).max(200).optional(),
    failure_reason: z.enum(["busy", "no-answer", "unknown"]).optional(),
  }).passthrough(),
}).passthrough();
const MAX_WEBHOOK_BYTES = 1024 * 1024;

async function readBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_WEBHOOK_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: Request) {
  if (!env.ELEVENLABS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }
  const rawBody = await readBody(request);
  if (rawBody === null) return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  if (!verifyElevenLabsWebhookSignature(rawBody, request.headers.get("elevenlabs-signature"), env.ELEVENLABS_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
  const parsed = EventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid webhook event." }, { status: 400 });
  const event = parsed.data;

  // Audio is disabled for this app. Never persist or log a transcript or audio payload.
  if (event.type === "post_call_audio" || !event.data.conversation_id) return NextResponse.json({ received: true });

  const conversationId = event.data.conversation_id;
  const [call] = await db.select({ id: practiceCalls.id, drillId: practiceCalls.drillId })
    .from(practiceCalls).where(eq(practiceCalls.elevenlabsConversationId, conversationId)).limit(1);
  if (!call) return NextResponse.json({ received: true });

  if (event.type === "call_initiation_failure") {
    const status = event.data.failure_reason === "no-answer" || event.data.failure_reason === "busy" ? "no_answer" : "failed";
    await db.transaction(async (tx) => {
      await tx.update(practiceCalls).set({ status }).where(and(
        eq(practiceCalls.id, call.id),
        inArray(practiceCalls.status, ["placing", "placed"]),
      ));
      if (call.drillId) await tx.delete(drills).where(and(eq(drills.id, call.drillId), eq(drills.mode, "practice_call")));
    });
    return NextResponse.json({ received: true });
  }

  if (call.drillId) {
    const deps = getRuntimeDeps();
    const record = await deps.store.get(call.drillId);
    if (record?.status === "live" && record.mode === "practice_call") {
      await finishDrill(deps, record.id, "user_hung_up");
    }
  }
  await db.update(practiceCalls).set({ status: "completed" }).where(and(
    eq(practiceCalls.id, call.id),
    inArray(practiceCalls.status, ["placing", "placed"]),
  ));
  return NextResponse.json({ received: true });
}
