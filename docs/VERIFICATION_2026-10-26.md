# Hang Up verification — 26 October 2026

## Released app

- Public app: https://hang-up-theta.vercel.app
- Practice calls: https://hang-up-theta.vercel.app/judge
- Current deployment: `dpl_2r6gsZQT5nAfDKpZ7JcuxyaTH35N` (`READY`).
- The configured ElevenLabs agent points at the deployed `/api/llm` endpoint. Ngrok and a running laptop are no longer required for that endpoint.
- Vercel production environment is configured with server-side secrets. Preview deployments retain Vercel protection. Neon migrations 0006 and 0007 are applied.
- No Twilio setup, phone call, real email delivery, or microphone/audio session was performed in this work.

## Changes

- Home now says **Choose from three practice calls**.
- Text selections call the Director directly without opening an ElevenLabs session. Token, connection, microphone-permission and connection-timeout failures can fall back to text in all browser practice modes.
- The installed ElevenLabs React SDK reports startup failures through callbacks; the call UI handles those callbacks, unexpected disconnects, late connection events, duplicate starts and disconnects during fallback.
- Typed replies remain available after a failed send. A failed finish stops the call and offers **Retry replay**, instead of hiding a save failure. Competing finish requests retry real version conflicts; database outages are no longer mistaken for conflicts. The Custom LLM transport returns complete SSE on an outage without exposing the exception or transcript.
- Selected scenario openings, premade voices and saved speech speed are passed using agent-allowed overrides. Six old voice IDs returned `voice_not_found`; they were replaced with six verified `premade` voices.
- Agent authentication is on; backup LLM cascading is off; End call is on; audio recording is off; provider retention is one day; provider conversations are capped at five minutes.
- A real production model incorrectly marked **Okay, I understand** as a disclosure after the caller asked for a name. A narrow exact acknowledgment rule now returns `comply_minor`, after existing wallet-leak and exit rules. Classifier instructions require actual supplied information and treat quoted input as untrusted data. Tests and ENGINE.md were updated; taxonomy and scoring constants were preserved.
- Settings no longer reapply an old high-contrast preference over a deliberate header theme choice. Sign-out clears personalized router caches with a fresh navigation. Circle, invite, label, callback-card and group controls recover from network errors.
- Navigation no longer overlaps its controls at large text sizes. Long buttons and call controls wrap. Inline paragraph links are underlined. The licensed 34 KB Atkinson font is bundled locally, removing the Google Fonts build dependency and dev warning.
- Pilot consent, survey forms, unseen holdout reservation, later assessment costumes, learning isolation, in-app follow-up prompts, withdrawal and admin CSV export exist behind the disabled pilot gate. No source scale items or study outcomes were invented.

## Command evidence

### Production build

```text
$env:HANGUP_NEXT_DIST_DIR='.next-release'; npm run build
✓ Compiled successfully in 8.2s
Finished TypeScript in 10.0s
✓ Generating static pages using 15 workers (12/12)
Exit code: 0
```

`pnpm typecheck` and `pnpm lint` pass. The final lint run has no errors or warnings.

### Unit and database integration tests

```text
pnpm exec tsx scripts/test-isolated-db.ts hangup-qa-20261026 <verified-QA-host>
Running integration tests on the verified schema-only QA branch. Production is not used.
Test Files  29 passed (29)
Tests       158 passed (158)
Exit code: 0
```

The QA branch contained schema only, with no production user data. Its migration ledger was initialized to the schema copied from production before applying the new migration. Test credentials were captured privately and the host was checked before use. The temporary branch was removed after verification. Ordinary `pnpm test` without an explicitly supplied test database intentionally skips database suites.

### Browser and accessibility checks

```text
pnpm e2e
8 passed
```

Coverage: Home copy, three curated calls, text selection, call → replay, guest replay privacy, keyboard-only submission, microphone denial, preserving failed drafts, retrying replay save, mobile large text and WCAG serious/critical checks. Two workers prevent local Next compilation from being overloaded. Keyboard checks assert actual submission and no longer mistake a focused page body for a button.

```text
pnpm exec tsx scripts/check-browser-db.ts hangup-qa-20261026 <verified-QA-host>
PASS Signed-in settings, all controls, persistence, and header theme stability
PASS Signed-in dark settings accessibility and non-overlapping desktop navigation
PASS Signed-in Family Circle creation and dashboard navigation
PASS Two independent browsers: room join, projected text call, one vote, replay histogram, room closure
PASS Sign-out immediately refreshes navigation
```

This uses a synthetic QA account and a genuine Better Auth handshake with the email transport mocked. It creates no real email and no voice session. Screenshots are under `reports/qa/`.

### Real production smoke

```text
PLAYWRIGHT_BASE_URL=https://hang-up-theta.vercel.app
pnpm e2e e2e/judge.spec.ts --grep 'guest can complete' --workers=1
1 passed (16.9s)

/judge: HTTP 200
/api/admin/pilot/export: HTTP 404
/api/cron/retention: HTTP 401
```

The production test exercised the live database, configured actor model, scoring and replay. A new browser received 404 for the guest replay. Production text checks use the AI Gateway model, but do not start ElevenLabs audio. Same-origin unauthenticated sign-out with an invalid session cookie returned 200; an untrusted origin with that test cookie returned 403. Resend's API returned 200 and the configured sending domain was verified; actual message delivery was not tested.

### Provider preflight

```text
pnpm check:elevenlabs
PASS Custom LLM selected
PASS Backup LLMs disabled
PASS End call tool enabled
PASS Agent is private
PASS Audio recording off
PASS Provider retention at most one day
PASS Required session overrides allowed
PASS Captions enabled
PASS Five-minute provider limit
PASS Premade voice: official_male
PASS Premade voice: official_female
PASS Premade voice: young_adult_male
PASS Premade voice: young_adult_female
PASS Premade voice: technician
PASS Premade voice: upbeat_host
PASS Custom LLM reachability/authentication/SSE (HTTP 200)
No conversation, model generation, or audio session was started.
```

## Recording

`reports/demo/hang-up-text-demo.webm` is a short, silent software-demo clip of the real production Home → text call → replay journey. It contains fictional practice only. It is a usable segment for the existing three-minute presentation, not a finished narrated three-minute submission or a human pilot recording.

## Remaining human or external gates

1. Test a real microphone/audio conversation on `/judge`, then check the replay. Read-only agent preflight cannot prove audio quality, interruption handling or network latency.
2. Verify actual sign-in email delivery to the intended recipient. No real email was sent here.
3. Keep scheduled phone calls off until the separate Twilio, consent and adult review work is authorized and completed.
4. Keep pilot enrollment off until an admin supplies and cites the five source items, verifies scoring, sets `ADMIN_EMAILS`, and an adult reviews the consent and protocol. Longitudinal outcomes require actual participants and weeks of follow-up.
5. The 200-label human gold set, classifier agreement/recall thresholds and the full real-model bot matrix remain unmeasured. The acknowledgment regression is fixed; that does not establish general classifier accuracy.
6. Vercel captures structured request errors and drill failure events. No separate external alerting/error-tracker account was connected. This workspace has no Git checkout, so this work was deployed by the linked Vercel CLI; no PR or CI result is claimed.

## Failures encountered and resolved

- Invalid voice IDs; public agent; fallback models bypassing the Director; missing End call; recording enabled: corrected and read back through the API.
- Vercel initially protected the public deployment: production was made public while previews remain protected.
- The first Custom LLM URL update lacked the required explicit model selector: retried with `llm: custom-llm`, then verified.
- Migration approval initially rejected an unverified remote target: read-only ledger/data checks and an isolated QA migration established the additive changes before approval and application.
- Clean-build font/network failures and repeated font warnings: removed by bundling the licensed font. A sandbox-generated-types permission failure was rerun with the approved filesystem permission.
- Browser timing/focus assumptions: concurrency was bounded and keyboard assertions strengthened. Signed-in checks found and verified fixes for sign-out caching, theme reapplication, overlapping navigation and inline link distinction.
- Production acknowledgment false disclosure: reproduced, fixed with a narrow rule, and rechecked against the deployed app.
- Recording initially lacked Playwright's video encoder: its small runtime was installed and the production recording completed successfully.
