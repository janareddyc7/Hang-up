import "server-only";

import { env } from "@/env";

/** Ends a known Twilio call without logging the number or provider response body. */
export async function terminateTwilioCall(callSid: string): Promise<boolean> {
  if (!/^CA[0-9a-f]{32}$/i.test(callSid) || !env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return false;
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Calls/${encodeURIComponent(callSid)}.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ Status: "completed" }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
