import "server-only";

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { practiceCallConsents, practiceCalls } from "@/db/schema";
import { terminateTwilioCall } from "@/lib/practice-calls/twilio";

/** Revoke enrollment transactionally and prevent every not-yet-completed call. */
export async function revokePracticeCallsForUser(userId: string, cancelActiveProviderCalls = false): Promise<void> {
  const callSids = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
    const activeCalls = cancelActiveProviderCalls
      ? await tx.select({ callSid: practiceCalls.twilioCallSid }).from(practiceCalls).where(and(
        eq(practiceCalls.userId, userId),
        inArray(practiceCalls.status, ["placing", "placed"]),
        isNotNull(practiceCalls.twilioCallSid),
      ))
      : [];
    await tx.delete(practiceCallConsents).where(eq(practiceCallConsents.userId, userId));
    await tx.update(practiceCalls).set({ status: "stopped" }).where(and(
      eq(practiceCalls.userId, userId),
      inArray(practiceCalls.status, ["scheduled", "placing", "placed"]),
    ));
    return activeCalls.flatMap(({ callSid }) => callSid ? [callSid] : []);
  });
  if (cancelActiveProviderCalls) {
    for (const callSid of callSids) {
      if (!(await terminateTwilioCall(callSid))) {
        console.error(JSON.stringify({ event: "practice_call.active_call_cancel_failed", timestamp: new Date().toISOString() }));
      }
    }
  }
}
