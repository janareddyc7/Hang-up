# API: route handlers and server actions

Route handlers are thin: parse input with Zod, call `src/lib/**`, return. All business logic lives in the engine and runtime.

## Route handlers

| Method + path | Caller | Auth | Behavior |
| --- | --- | --- | --- |
| `POST /api/llm/chat/completions` | ElevenLabs Custom LLM | `Bearer HANGUP_LLM_SECRET` | `handleCustomLlmRequest(req, getRuntimeDeps())`. `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 30` |
| `GET /replay/[drillId]` | Browser | owner, public Judge drill id, or coach in a shared circle | Scores a just-ended drill if needed; transcript appears to the owner/Judge and only to coaches when the trainee enabled sharing |
| `POST /api/webhooks/elevenlabs` | ElevenLabs post-call webhook | HMAC `ElevenLabs-Signature` over the raw body; timestamp checked (30 min past / 5 min future) | Completes the app's own drill or records no-answer; never stores provider transcript/audio/phone metadata |
| `GET /api/cron/practice-calls` | Vercel Cron after release approval | `Bearer CRON_SECRET`; `?dryRun=1` never places calls | Reserve and place only due Practice Calls (docs/SAFETY.md rules); requires both `PRACTICE_CALLS_ENABLED` and `PRACTICE_CALLS_ADULT_REVIEWED` |
| `GET /api/cron/retention` | Vercel Cron, daily | `Bearer CRON_SECRET` | Delete anonymous Judge drills older than seven days |
| `GET, POST /api/auth/[...all]` | Better Auth | n/a | `toNextJsHandler(auth)` |

Better Auth sends five-minute, single-use sign-in links through Resend. The `/sign-in` page accepts an email and returns a generic confirmation. `getSession()` and `requireUser()` in `src/lib/auth/session.ts` are the server-side session helpers. The root `proxy.ts` redirects signed-out visits under `/practice`, `/circle`, `/settings`, `/card`, `/facilitate` and `/admin`; protected server pages and actions must also call `requireUser()` before reading or changing user data, because Proxy only checks for a session cookie.

Read the webhook body as bounded raw bytes before parsing; the HMAC is over the exact bytes. Reject stale signatures and never log or persist provider transcript/audio payloads.

## Server actions (`app/actions/*.ts`, `"use server"`)

All return `{ ok: true, ... } | { ok: false, error: string }`. Inputs validated with Zod.

### Drills

```ts
startDrill(input: {
  personaId: string;
  difficulty: "easy" | "realistic" | "relentless";
  mode: "judge" | "sparring" | "assigned" | "group";
  textOnly: boolean;
  offline?: boolean;                 // Judge only: skip ElevenLabs and continue with local text turns
  assignmentId?: string;
}): Promise<{
  ok: true;
  drillId: string;
  // voice: WebRTC conversation token; text: WebSocket signed URL
  connection: { conversationToken: string } | { signedUrl: string } | null;
  offlineFallback: boolean;
  firstMessage: string;
  voiceId: string;                 // from ELEVENLABS_VOICE_IDS[persona.voiceRole]
  callerIdDisplay: string;
  wallet: PracticeWallet;          // shown on screen
  sessionUserId: string | null;    // pass to startSession({ userId })
}>
```

Steps: rate-limit (Judge mode: 10 drills per IP per hour) → validate the persona → fetch a session token for online voice/text, then create the drill. Offline Judge text skips the ElevenLabs request; a failed Judge token request also becomes an offline drill:
- voice: `GET https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=…` → `{ token }`
- text: `GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=…` → `{ signed_url }`

with header `xi-api-key: ELEVENLABS_API_KEY`.

Judge-mode start limits currently use an in-memory sliding window (10 starts per IP per process). It resets on process restart and is not shared across serverless instances; use a shared limiter before production scaling.

If a Judge session is explicitly offline or ElevenLabs cannot issue a token, `connection` is `null` and the result includes `offlineFallback: true`. Continue with `localTextTurn`; no voice session is started. Anonymous Judge drills are bound to an HTTP-only browser session cookie; replay, text-turn, finish, and conversation-attach actions check the saved session hash. Signed-in trainees use their account, and coaches need a shared circle membership.

Client then calls:

```ts
await conversation.startSession({
  conversationToken,                       // or signedUrl in text mode
  userId: sessionUserId ?? undefined,
  customLlmExtraBody: { drill_id: drillId },
  dynamicVariables: { drill_id: drillId }, // optional, for dashboard search
  textOnly,
});
```

The app uses the agent's dashboard greeting and default premade voice. It does not send per-call greeting or voice overrides, which were rejected by the configured agent. If the browser reports a voice connection error in Judge mode, switch to local text and keep the same drill.

```ts
attachConversation(input: { drillId: string; conversationId: string }): Promise<{ ok: true }>
```
Call right after `startSession` resolves; stores `elevenlabs_conversation_id` so the webhook can find the drill.

```ts
finishDrill(input: { drillId: string }): Promise<{ ok: true; score: ScoreSummary }>
```
Idempotent. Scores if needed, updates skills and item difficulty in one transaction (T12), marks the assignment complete. Called from `onDisconnect` and the Hang Up button.

```ts
localTextTurn(input: { drillId: string; text: string }): Promise<{ ok: true; result: TurnResult }>
```
Offline fallback for Judge mode when ElevenLabs is unreachable: calls `runTurn()` directly. Only for `mode: "judge"` drills.

```ts
flagTag(input: { turnId: number; reason?: string }): Promise<{ ok: true }>
```

### Family Circle

```ts
createCircle(input: { name: string }): Promise<{ ok: true; circleId: string }>
inviteToCircle(input: { circleId: string; email: string; role: "coach" | "trainee" }): Promise<{ ok: true }>
acceptInvite(input: { token: string }): Promise<{ ok: true; circleId: string }>
setShareTranscripts(input: { circleId: string; share: boolean }): Promise<{ ok: true }>   // trainee only
assignDrill(input: { circleId: string; traineeId: string; personaId?: string; difficulty?: Difficulty; dueAt?: string }): Promise<{ ok: true }>
```

Invites: random 32-byte token emailed (Resend); store only its SHA-256 and normalized recipient email; expire in 7 days and accept once. Acceptance requires the signed-in email to match the invite. Only coaches assign; only the trainee changes sharing. Transcript sharing defaults off. The coach dashboard shows scores and skills; replay transcripts are available to a coach only when sharing is on.

### Practice and settings

```ts
nextDrill(): Promise<{ ok: true; choice: DrillChoice | null }>          // chooseNextDrill over the user's skills
savePreferences(input: { textScale?: number; speechRate?: number; highContrast?: boolean; prefersText?: boolean; safeWordSet?: boolean }): Promise<{ ok: true }>
```

`/practice` puts open coach assignments (due first) ahead of the adaptive next call and links completed drills to their replay. New trainees receive three realistic placement calls before recommendations use their skill history. `savePreferences` persists accessibility and call-mode preferences to the signed-in user's profile. Callback-card bank/family numbers stay in browser `localStorage`; only the `safe_word_set` boolean is stored server-side, never the safe word itself.

### Practice Calls (phase 4)

```ts
beginPhoneVerification(input: { phoneE164: string }): Promise<{ ok: true }>   // sends a one-time code (Twilio Verify)
confirmPracticeCalls(input: {
  phoneE164: string;
  code: string;
  consentTextVersion: string;   // the exact text shown, versioned
  accepted: true;
  daysOfWeek: number[]; windowStartMinute: number; windowEndMinute: number; timezone: string; maxPerWeek: 1 | 2 | 3;
}): Promise<{ ok: true }>
revokePracticeCalls(): Promise<{ ok: true }>
```

The number is sent to Twilio Verify only to confirm ownership, then stored AES-256-GCM encrypted. Saying “stop practice”, “stop”, or “unsubscribe” ends the live call and revokes consent; scheduled calls are canceled and the encrypted number is deleted in the same database transaction. Both release flags must be enabled before any verification or scheduled call can run. The weekly limit uses a rolling seven-day window. The 15-minute schedule requires a Vercel plan that supports frequent cron execution; keep the cron unscheduled until that plan and the adult review are confirmed. `?dryRun=1` logs only a payload preview with the phone and account IDs redacted, and never places a call.

Placing a call (inside the cron route):

```ts
POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call
{
  "agent_id": ELEVENLABS_AGENT_ID,
  "agent_phone_number_id": ELEVENLABS_PHONE_NUMBER_ID,
  "to_number": "+1...",
  "conversation_initiation_client_data": {
    "user_id": "<userId>",
    "custom_llm_extra_body": { "drill_id": "<drillId>" },
    "conversation_config_override": {
      "agent": { "first_message": "This is a Hang Up practice call. Say stop practice at any time to end it. <persona firstMessage>" },
      "tts": { "voice_id": "<voiceId>" }
    }
  }
}
```

Store the returned `conversation_id` and `callSid`.

### Group mode

```ts
createGroupSession(input: { personaId: string; difficulty: Difficulty }): Promise<{ ok: true; sessionId: string; joinCode: string }>
joinGroup(input: { joinCode: string }): Promise<{ ok: true; sessionId: string; participantKey: string }>
voteHangUp(input: { sessionId: string; participantKey: string; k: number }): Promise<{ ok: true }>
```

The facilitator's browser runs the call; participants poll (or subscribe) for the current `k`. Votes overlay the replay's pressure line.

## Shared types

`ScoreSummary` = `Pick<ScoreResult, "score" | "outcome" | "pointOfNoReturnK" | "turnsPastPointOfNoReturn" | "msPastPointOfNoReturn" | "habit">`. Everything else is in `src/lib/engine`.
