# Release and presentation readiness

## Current build (26 October 2026)

- Production: [Hang Up](https://hang-up-theta.vercel.app), [practice calls](https://hang-up-theta.vercel.app/judge). The agent uses the production `/api/llm` endpoint; no ngrok process is required.
- Verified: clean production build; typecheck; lint; 158 tests including isolated Neon integration; eight local browser/accessibility checks; a real production text call through replay; fresh-browser replay denial; same-origin auth allowed and an untrusted origin with a session cookie rejected; Resend API and verified sending domain; read-only ElevenLabs configuration, voices and SSE preflight.
- The six invalid saved voice IDs were replaced with available premade library voices. Agent authentication is on, backup LLM cascading is off, End call is enabled, audio recording is off, retention is one day, and conversation duration is capped at five minutes.
- Migrations 0006 and 0007 have been applied. No phone calls or emails were sent during these checks. Scheduled phone calls and pilot enrollment remain off.
- Still needs a person: final live microphone/audio call, actual email delivery to the intended sign-in address, adult review, human gold-set labels, and any real longitudinal pilot. The pilot code exists but its five source items and review gate remain deliberately incomplete. Do not claim calibration or a learning effect.

Full command evidence and resolved issues: [26 October verification](VERIFICATION_2026-10-26.md). A silent production text-demo segment is saved at `reports/demo/hang-up-text-demo.webm` for the existing presentation.

## Safe demo data

`pnpm seed:demo --coach-email you@example.com` is a dry run. It proposes one synthetic trainee and up to three scripted, fictional drills inside the signed-in coach's Family Circle. It creates no login for the demo trainee and leaves transcript sharing off.

To write it, first confirm `.env.local` points at the intended database and migrations are applied, set `DEMO_SEED_ENABLED=true`, then run:

```powershell
pnpm seed:demo --coach-email you@example.com --apply
```

The seed labels all demo data as synthetic. Do not leave it in a public production dashboard after recording.

## Production release gates

- Link the intended Vercel project and set production secrets in the Vercel dashboard. Never paste them into chat or commit them.
- Apply Drizzle migrations to the production Neon database and verify a separate test database before release.
- Configure the production ElevenLabs agent with the deployed `/api/llm` base URL, its Custom LLM secret, and premade voices. Keep audio recording off.
- Configure the signed post-call webhook at `/api/webhooks/elevenlabs`; keep audio webhooks off.
- Run the production voice and text smoke checks with an adult reviewer. The Playwright E2E path is a local deterministic simulation, not a live voice-provider test.
- Keep `PRACTICE_CALLS_ENABLED` and `PRACTICE_CALLS_ADULT_REVIEWED` false until an adult reviews the consent, phone verification, stop/revoke flow, ElevenLabs/Twilio account setup, and applicable call requirements. A 15-minute Vercel cron also requires a plan that supports frequent schedules.
- Keep `PILOT_ENABLED=false` until the teacher/adult approves the protocol and the five source scale items are entered into the pilot config with their citation.
- Do not state that T17 calibration or T22 learning effects passed until real human labels and pilot results have been collected and reviewed.
- Record the presentation with a consenting adult, or describe it clearly as a software demo. Use the three-minute run-of-show in `docs/PRESENTATION_VIDEO.md`.
