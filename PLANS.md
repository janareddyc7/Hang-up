# PLANS.md: build plan for Hang Up

Work top to bottom. One task per branch and PR. Each task lists what to build, what "done" means, and a prompt to paste into Codex. Every prompt assumes Codex has read `AGENTS.md`.

Status legend: `[ ]` todo, `[~]` in progress, `[x]` done. Update the box in the same PR.

## Milestones and gates

| Milestone | Tasks | Gate before moving on |
| --- | --- | --- |
| M0 Foundation | T01–T03 | App runs; 83 kit tests green in the app repo; theme renders in light, dark, high contrast |
| M1 Data and auth | T04–T05 | Drills persist with optimistic locking; magic-link sign-in works |
| **M2 Judge-ready call** | T06–T11 | **A stranger finishes a voice call and reads their replay without help (try 3 people)** |
| M3 Learning system | T12–T15 | Skills update after each drill; coach sees a trainee's per-tactic bars |
| M4 Quality | T16–T19 | Bot harness bands pass; kappa ≥ 0.61 and hard-fail recall ≥ 0.95; axe clean |
| M5 Real world | T20–T22 | Practice Call consent flow reviewed by an adult; pilot instruments ready |
| M6 Ship | T23–T24 | Production deploy, demo seed, video recorded |

If time is short, M2 alone is a complete, judge-ready app. Do not start M3 before the M2 gate.

---

## M0 Foundation

### [x] T01 Scaffold the app and adopt the kit

Create the Next.js 16 app (App Router, TypeScript, Tailwind v4, ESLint, pnpm), add Vitest and Playwright, and move the kit's `src/`, `content/`, `tests/`, `docs/` into it without changing engine code.

Done when: `pnpm typecheck`, `pnpm test` (83 tests) and `pnpm lint` pass; `pnpm dev` serves a placeholder home page; scripts from AGENTS.md exist in `package.json`.

```text
Read AGENTS.md. Do task T01 in PLANS.md.
Scaffold a Next.js 16 App Router project in this repo with TypeScript (strict, noUncheckedIndexedAccess), Tailwind CSS v4, ESLint and pnpm. Add Vitest (config: tests/**/*.test.ts) and Playwright. Keep the existing src/lib, src/db, src/styles, content, tests and docs folders exactly as they are; only fix import paths if the scaffold requires it, and set up the "@/*" alias to "./src/*".
Add package.json scripts: dev, build, start, typecheck (tsc --noEmit), test (vitest run), lint, e2e (playwright test), db:generate, db:migrate, bots (tsx scripts/bots.ts, can be a stub for now).
Install the runtime deps the kit imports: zod, ai, drizzle-orm. Check latest stable versions first.
Acceptance: pnpm typecheck, pnpm test (all 83 existing tests), pnpm lint pass. Do not edit anything in src/lib/engine or tests/engine.
```

### [x] T02 Environment validation

`src/env.ts` validates env with Zod (server and client split). `.env.example` already lists every variable.

Done when: the app fails fast at boot with a clear message if a required server variable is missing; nothing secret is reachable from client bundles.

```text
Read AGENTS.md and .env.example. Do T02 in PLANS.md.
Create src/env.ts that parses process.env with Zod into a typed `env` object. Server-only variables must not be importable from client components (use the "server-only" package in the server module). ELEVENLABS_VOICE_IDS is JSON mapping each voiceRole in src/lib/engine/schema.ts to a voice id; validate that every role is present.
Practice Call and Twilio variables are optional unless PRACTICE_CALLS_ENABLED=true.
Add a unit test for the voice-id map validation. Acceptance: typecheck, test, lint pass.
```

### [x] T03 Theme, fonts, layout, component libraries

Wire `src/styles/theme.css`, load Atkinson Hyperlegible Next via `next/font/google` as `--font-atkinson`, init shadcn/ui, add ElevenLabs UI components (`orb`, `live-waveform`, `conversation`, `message`), build the app shell and a theme switcher (light, dark, high contrast) plus a text-size control.

Done when: a `/styleguide` page (dev only) shows type scale, buttons, tactic chips for all 12 tactics, the call surface, in all three themes; text size 1.0/1.25/1.5× works.

```text
Read AGENTS.md and docs/DESIGN.md. Do T03 in PLANS.md.
Import src/styles/theme.css from app/globals.css. Load "Atkinson Hyperlegible Next" with next/font/google (weights 400, 600, 700) as the CSS variable --font-atkinson. Initialize shadcn/ui so its tokens map to ours (theme.css already defines the shadcn variable names). Install ElevenLabs UI components orb, live-waveform, conversation and message (via the shadcn registry at ui.elevenlabs.io) and restyle them with our tokens only.
Build: root layout with a skip link; ThemeProvider supporting light, dark and high contrast (data-contrast="high" on <html>); a text-size control (1, 1.25, 1.5) stored in localStorage for now; components TacticChip (props: tactic; bright-line tactics render solid signal red with white text, others a 12% tint, 1px border in the hue, ink text; label from TACTIC_INFO) and a dev-only /styleguide page.
Follow DESIGN.md exactly: no all-caps labels, no hard-coded colors, 48px minimum targets. Acceptance: typecheck, test, lint pass; styleguide renders in all three themes.
```

---

## M1 Data and auth

### [x] T04 Database and DrizzleDrillStore

Neon Postgres, `drizzle.config.ts`, migrations from `src/db/schema.ts`, `src/db/client.ts`, and `src/lib/drill/drizzle-store.ts` implementing `DrillStore` per `docs/DATA_MODEL.md`.

Done when: integration tests against a real test database prove get/save round-trips a `DrillRecord`, a stale `version` throws, and turns are append-only.

```text
Read AGENTS.md, docs/DATA_MODEL.md and src/lib/drill/runtime.ts. Do T04 in PLANS.md.
Set up Drizzle with Postgres (Neon serverless driver for the app; DATABASE_URL_UNPOOLED for migrations). Generate and apply migrations from src/db/schema.ts. Create src/db/client.ts.
Implement src/lib/drill/drizzle-store.ts: class DrizzleDrillStore implements DrillStore. get(id) loads drills + turns ordered by seq into a DrillRecord. save(record) runs in a transaction: insert when version = 1, else UPDATE ... WHERE id = $id AND version = $version - 1 and throw if no row changed; insert only new turns (seq greater than stored max). Also persist score, outcome, score_detail, end_reason, ended_at when present.
Write integration tests in tests/db/ that run only when TEST_DATABASE_URL is set (skip otherwise). Cover: round trip, version conflict throws, append-only turns, ended drill fields.
Do not change DrillRecord or the runtime; adapt in the store. Acceptance: typecheck, test, lint pass.
```

### [x] T05 Auth with Better Auth

Better Auth with the Drizzle adapter and magic-link plugin (email via Resend), `nextCookies()` plugin, `/api/auth/[...all]`, a `getSession()` server helper, sign-in page, and route protection for signed-in areas. Replace `src/db/auth-schema.ts` with the CLI output.

Done when: magic-link sign-in works locally; `/practice`, `/circle`, `/settings` redirect signed-out users; `/`, `/judge`, `/call/*` (judge mode) stay public; a `profiles` row is created on first sign-in.

Verification note: the full auth/session/profile flow passes against the Neon test branch with Resend captured in the test. The Resend key and verified sender domain were checked; no real login token was sent during verification.

```text
Read AGENTS.md and docs/API.md. Do T05 in PLANS.md.
Add Better Auth (latest) with drizzleAdapter (provider "pg"), the magicLink plugin sending email through Resend (RESEND_API_KEY, EMAIL_FROM), and the nextCookies plugin. Mount the handler at app/api/auth/[...all]/route.ts. Generate the auth tables with the Better Auth CLI into src/db/auth-schema.ts (keep the export name `user`) and migrate.
Create src/lib/auth/session.ts with getSession() and requireUser() for server components and actions. Protect /practice, /circle, /settings, /card, /facilitate and /admin using the current Next.js 16 request-interception convention (check the docs for the file name). Create a profiles row on first sign-in.
Sign-in page: one email field, large type, copy "We'll email you a link to sign in. No password needed."
Do not add next-auth. Acceptance: typecheck, test, lint pass; manual sign-in works.
```

---

## M2 Judge-ready call

### [x] T06 Custom LLM route and runtime deps

`src/lib/drill/deps.ts` builds `RuntimeDeps` (DrizzleDrillStore, personas loaded from `content/personas` via static imports and `loadPersonas`, actor and classifier models via the AI SDK, `HANGUP_LLM_SECRET`, clock, `drl_` + `crypto.randomUUID()` ids). Route `app/api/llm/chat/completions/route.ts` wraps `handleCustomLlmRequest`.

Done when: a request shaped like ElevenLabs' (see `docs/ARCHITECTURE.md`) streams SSE; wrong bearer gets 401; route tests pass with mock models.

Verification note: route and dependency tests pass with mock AI models; production build passes. Live AI Gateway inference remains unverified because no `AI_GATEWAY_API_KEY` is configured.

```text
Read AGENTS.md, docs/ARCHITECTURE.md (route contract) and src/lib/drill/runtime.ts. Do T06 in PLANS.md.
Create src/lib/drill/deps.ts exporting getRuntimeDeps() (memoized per process). Personas: import every JSON in content/personas statically and pass through loadPersonas(); never import persona JSON into client code. Models: create the actor and classifier models with the AI SDK from env (ACTOR_MODEL, CLASSIFIER_MODEL; use whichever provider package matches, or an AI Gateway model id string). ids: "drl_" + crypto.randomUUID().
Create app/api/llm/chat/completions/route.ts: export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 30; POST returns handleCustomLlmRequest(req, getRuntimeDeps()).
Log only drill id, move, decidedBy and timings (never text).
Tests in tests/api/llm-route.test.ts with MockLanguageModelV4 from "ai/test" and InMemoryDrillStore injected (make getRuntimeDeps overridable for tests). Acceptance: typecheck, test, lint pass.
```

### [x] T07 startDrill, attachConversation, finishDrill actions

Server actions per `docs/API.md`, including server-side ElevenLabs token or signed URL, Judge-mode rate limit, voice id lookup.

Verification note: action tests mock ElevenLabs token responses and cover voice/text credentials, session-derived ownership, Judge rate limiting, conversation attachment, and idempotent finish. `pnpm typecheck`, `pnpm test` (110 passed, 4 skipped), and `pnpm lint` pass. The Judge limiter is in-memory per process; a distributed limiter remains a deployment concern.

Done when: calling `startDrill` returns everything the client needs; `finishDrill` is idempotent; the ElevenLabs API key never appears in client bundles.

```text
Read AGENTS.md and docs/API.md (Drills section). Do T07 in PLANS.md.
Implement app/actions/drills.ts ("use server"): startDrill, attachConversation, finishDrill, localTextTurn, flagTag exactly as specified. startDrill calls createDrill(getRuntimeDeps(), ...) then fetches a WebRTC conversation token (GET https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=...) for voice, or a signed URL (GET .../conversation/get-signed-url?agent_id=...) for text mode, with header xi-api-key. Map persona.voiceRole to a voice id with env.ELEVENLABS_VOICE_IDS. Judge mode: rate limit 10 per IP per hour (simple Postgres or in-memory sliding window is fine; note the limitation). userId comes from the session, never from input.
finishDrill wraps runtime finishDrill and (for now) only returns a ScoreSummary; skills come in T12.
Unit-test input validation and the voice-id mapping; mock fetch for the token calls. Acceptance: typecheck, test, lint pass.
```

### [x] T08 ElevenLabs agent configuration (human + small code)

Follow `docs/ELEVENLABS_SETUP.md` for the dev agent and a tunnel. Code: `docs/ELEVENLABS_SETUP.md` values go into `.env.local`; add `scripts/check-elevenlabs.ts` that verifies the agent is reachable and that a fake turn to the route streams.

Done when: talking to the agent through the app reaches the route and you hear the persona.

Verification note: the configured agent connected through the app and returned a live caller reply. Per-call first-message and voice overrides were removed after ElevenLabs rejected them; the agent's dashboard defaults are used.

```text
Read docs/ELEVENLABS_SETUP.md. Do the code part of T08 in PLANS.md.
Create scripts/check-elevenlabs.ts (run with tsx): (1) GET the agent with xi-api-key and print whether llm is custom and points at our URL; (2) create a drill directly with createDrill against the configured DB; (3) POST a fake ElevenLabs-shaped request to our route with the bearer secret and print the streamed text. Add "check:elevenlabs" to package.json. Do not commit secrets. Acceptance: typecheck, lint pass.
```

### [x] T09 Call screen

`/call/[scenario]`: incoming call (ring motion, caller ID, Practice Wallet), answer → `startDrill` → `startSession` inside `ConversationProvider`, live captions, timer, Mute, Text toggle, Hang up → `finishDrill` → `/replay/[id]`. Text mode uses `textOnly`.

Done when: a full voice call works end to end locally through a tunnel; text mode works without a microphone; Hang up and `end_call` both land on the replay.

Verification note: the user confirmed the call and replay worked. A separate live text-session smoke test confirmed the greeting and first caller reply; do not repeat paid live sessions during local verification.

```text
Read AGENTS.md, docs/DESIGN.md (Incoming call, In call) and docs/API.md. Do T09 in PLANS.md.
Build app/call/[scenario]/page.tsx (server: validate scenario id, read difficulty and mode from search params) and client components IncomingCall, InCall, PracticeWallet under components/call/. Use @elevenlabs/react: wrap in <ConversationProvider>, use useConversationControls/useConversationStatus/useConversationMode (granular hooks). On Answer: request microphone (explain why first), call startDrill, then startSession({ conversationToken | signedUrl, userId: sessionUserId, customLlmExtraBody: { drill_id }, overrides: { agent: { firstMessage }, tts: { voiceId, speed } }, textOnly }); then attachConversation with the returned conversation id.
Captions: onMessage → keep the last two lines in an aria-live="polite" region. The Practice Wallet includes a "New text message" with the one-time code from the start, marked unread until tapped (simple and reliable; a client-tool version that delivers it at the payment stage can come later).
On Hang up: endSession(), then finishDrill, then router.push(`/replay/${drillId}`). onDisconnect (agent ended the call) does the same. If startSession fails in judge mode, offer "Continue in text" which uses localTextTurn.
Use the call-surface tokens and ringing utilities; respect reduced motion. Acceptance: typecheck, test, lint pass; manual voice call and text call both reach the replay.
```

### [x] T10 Replay

`/replay/[drillId]`: summary (score, outcome sentence, habit), transcript with tactic chips, the PressureLine SVG, the point-of-no-return rule, "This tag looks wrong", "Practice this again", "Print my callback card". Access: account owner; anonymous Judge trainee through an HTTP-only browser session; or coach in a shared circle (scores only unless the trainee enabled transcript sharing).

Done when: the replay matches `docs/DESIGN.md` on desktop and mobile in all three themes and reads correctly with a screen reader.

```text
Read AGENTS.md and docs/DESIGN.md (Replay: the pressure line, Copy). Do T10 in PLANS.md.
Build app/replay/[drillId]/page.tsx as a server component that loads the drill and its ScoreResult (score if missing via finishDrill). Components in components/replay/: ScoreSummary (outcome copy table in DESIGN.md), Transcript (scammer lines get TacticChip per tactic; user lines plain), PressureLine (SVG in the transcript gutter; fill height proportional to r(k)/max(r, threshold); colors --pressure-low to --pressure-high), PonrRule (caution-yellow rule after turn pointOfNoReturnK, caption "This is where to hang up"), and chip explainer popover with TACTIC_INFO.explain and a flagTag link.
Access rules: owner; anonymous Judge drills only with the trainee's browser session; coach only through a shared circle, with transcript access only if share_transcripts is true.
Never show raw numbers from the wallet. Acceptance: typecheck, test, lint pass; add a Vitest test for the outcome-copy selector.

Verification note: replay layout and theme states are covered at desktop and mobile widths; a fresh browser is denied a guest replay. `pnpm typecheck`, `pnpm lint`, `pnpm test` (121 passed, 4 skipped), `pnpm build`, and the offline Judge-to-replay browser flow pass. The test suite needs network access to resolve its configured Neon test database.
```

### [x] T11 Home and Judge mode

`/` recent-calls home and `/judge` with three curated calls (gov-consumer-safety realistic, grandchild-emergency realistic, bank-fraud-department easy). Offline fallback path verified.

Done when: from a fresh browser, `/judge` → call → replay works in under 60 seconds; with ElevenLabs blocked, text fallback still completes.

```text
Read AGENTS.md, docs/PRODUCT.md (Judge journey) and docs/DESIGN.md (Home). Do T11 in PLANS.md.
Build app/page.tsx (recent-calls list of all personas; "Missed, Nm ago" times are random per render and decorative) and app/judge/page.tsx (one sentence intro, three curated calls, each starts /call/[scenario]?mode=judge&difficulty=...). Copy from DESIGN.md. Add a "Text instead of voice" toggle.
Verify the offline path: if startSession throws, IncomingCall switches to a text chat that calls localTextTurn for each message and ends on TurnResult.kind === "end".
Acceptance: typecheck, test, lint pass; Playwright smoke test for /judge → text call → replay using the offline path (stub startSession failure).
```

Verification note: home and three curated Judge calls pass Playwright checks. Offline text practice completed through replay against Neon without starting ElevenLabs; a fresh browser received 404 for that replay. Token and voice connection errors fall back to local text on the same saved drill; the voice session closes before text fallback so its disconnect cannot end the replay early. The full validation commands pass with network access for the Neon test database.

**Gate M2:** three people who have never seen the app finish a call and explain their replay. Fix what confused them before M3.

---

## M3 Learning system

### [x] T12 Skills and item difficulty on finish

In `finishDrill` (action), within one DB transaction: for each `tacticOutcomes` entry update `skills` (Elo θ, Leitner box, `due_at`, `last_persona_id`, exposures) and `item_difficulty`; signed-in users only.

```text
Read AGENTS.md and docs/ENGINE.md section 6. Do T12 in PLANS.md.
Create src/lib/skills/update.ts: applyDrillToSkills(tx, userId, personaId, difficulty, tacticOutcomes, now) using updateElo, nextBox and dueAt from src/lib/engine/skills.ts; upsert skills and item_difficulty rows. Call it from finishDrill inside the same transaction that marks the drill scored; guard idempotency so finishing twice doesn't double-update (store skills_applied_at on drills via a migration).
Tests with the test DB: two drills move theta in the right direction; second finishDrill call changes nothing. Acceptance: typecheck, test, lint pass.
```

### [x] T13 Family Circle

Circles, invites (Resend), roles, privacy toggle, coach dashboard with SkillBars, assignments.

```text
Read AGENTS.md, docs/API.md (Family Circle), docs/DESIGN.md (Family dashboard) and docs/SAFETY.md section 6. Do T13 in PLANS.md.
Implement app/actions/circle.ts per API.md and pages app/circle/page.tsx and app/circle/invite/[token]/page.tsx. Invite tokens: 32 random bytes, emailed link, store only SHA-256, expire after 7 days, single use. Only coaches assign; only the trainee toggles share_transcripts (default off). SkillBars: per tactic, weakest first, label Practicing (<950) / Getting there (950–1100) / Strong (>1100), plus next due date.
Tests for authorization rules (coach can't toggle sharing, trainee can't assign, expired token rejected). Acceptance: typecheck, test, lint pass.
```

### [x] T14 Practice page and next-drill recommender

`/practice`: "Your next practice call" from `chooseNextDrill` over the user's skills and all personas (`personaTactics`), plus history and open assignments first.

```text
Read docs/ENGINE.md section 6. Do T14 in PLANS.md.
Build app/practice/page.tsx: open assignments (oldest due first) above the recommender card; recommender uses chooseNextDrill(skills, scenarios, now, itemDifficultyFromDb). New users with no drills get three placement calls (gov-consumer-safety, grandchild-emergency, tech-support, realistic). History list links to replays.
Unit-test the placement logic. Acceptance: typecheck, test, lint pass.
```

### [x] T15 Callback card and settings

`/card` printable card (safe word blank, numbers kept only in localStorage), `/settings` (text size, speech speed, contrast, prefer text) persisted in `profiles`.

```text
Read docs/DESIGN.md (Callback card) and docs/SAFETY.md. Do T15 in PLANS.md.
Build app/card/page.tsx with print CSS for a 5 x 3 inch card; the user's bank and family numbers are typed and kept only in localStorage; the safe word is a blank line written by hand, never typed. A checkbox "We set a family safe word" sets profiles.safe_word_set. Build app/settings/page.tsx saving profiles preferences via savePreferences; apply them app-wide (text scale on <html>, speechRate to tts.speed override, prefersText defaults the call to text mode).
Acceptance: typecheck, test, lint pass; print preview fits one card.
```

---

## M4 Quality

### [x] T16 Bot harness

`scripts/bots.ts` per `docs/TESTING.md`.

```text
Read docs/TESTING.md (Bot harness). Do T16 in PLANS.md.
Create scripts/bots.ts: for each persona x difficulty x bot (Compliant, Skeptical, Verifier, Confused) create a drill in InMemoryDrillStore with real models from getRuntimeDeps() but the in-memory store, loop runTurn() with bot replies from generateText (bot instructions per TESTING.md; Compliant reads the drill's wallet oneTimeCode when asked for a code), stop at end or 20 turns. Assert the four checks in TESTING.md, print a table, write reports/bots-<date>.md, exit non-zero on failures. Flags: --persona, --difficulty, --bot, --runs.
Acceptance: typecheck, lint pass; a dry run with --runs 1 completes.
```

### [~] T17 Gold-set labeling and kappa

`/admin/labels` (allowlist `ADMIN_EMAILS`), blind labeling UI writing `move_labels`; `scripts/kappa.ts` reporting kappa and per-label precision/recall with `src/lib/eval/kappa.ts`.

```text
Read docs/TESTING.md (Gold set). Do T17 in PLANS.md.
Build app/admin/labels/page.tsx (admins from ADMIN_EMAILS): shows one redacted user turn with the caller line before it, hides the classifier's label, offers the 15 move labels as large buttons and a notes field, writes move_labels. Sampling: stratified, at least 40 classifier hard fails per batch of 200.
scripts/kappa.ts: join turns with move_labels, print Cohen's kappa overall and precision/recall per label using src/lib/eval/kappa.ts; flag hard-fail recall below 0.95. Acceptance: typecheck, test, lint pass.
```

### [x] T18 Red-team suite

```text
Read docs/SAFETY.md section 2 and docs/TESTING.md (Red-team cases). Do T18 in PLANS.md.
Create tests/redteam/redteam.test.ts that drives runTurn() across all personas with the listed adversarial inputs, using a mock actor model that returns adversarial lines (real org names, URLs, phone numbers, "as an AI", a 400-character line) and asserts every stored scammer line passes validateLine or is a scripted fallback, nothing throws, and the drill state stays consistent. Add any validator gaps you find to src/lib/engine/actor.ts with tests (do not loosen existing checks). Acceptance: typecheck, test, lint pass.
```

### [x] T19 E2E and accessibility

```text
Read docs/TESTING.md (E2E) and docs/DESIGN.md (Accessibility checklist). Do T19 in PLANS.md.
Add Playwright tests: judge text flow via the offline path → replay shows chips, the point-of-no-return rule and a score; keyboard-only run of the same flow; @axe-core/playwright scans of /, /judge, the call screen and the replay with zero serious or critical violations. Fix violations in components, not by disabling rules. Acceptance: pnpm e2e passes locally and in CI.
```

**M3 verification:** T12–T15 implementation and authorization/privacy tests are complete. Settings are persisted for signed-in profiles; callback-card numbers remain browser-local. A prior Neon integration run passed; the current local run has no `TEST_DATABASE_URL` exported and skips those integration tests, so revalidate them before release.

**M4 verification:** T16's harness smoke passed for `tech-support / easy / Verifier`; the full persona/difficulty/bot matrix has not been run. T18 red-team suite and T19 Playwright/axe suite pass. T17's blind-label page, write action, and kappa reporter are implemented, but the required 200 human-reviewed labels do not exist yet, so kappa ≥0.61 and hard-fail recall ≥0.95 remain unmeasured. Do not treat M4 as a release-quality pass until the gold set is collected and the metric gate passes.

**Latest verification (26 October 2026):** `pnpm typecheck`, `pnpm lint`, a clean `npm run build` in `.next-release`, and the eight-test Playwright/axe suite pass. All 158 Vitest tests pass against a separate schema-only Neon QA branch, including auth, database persistence, learning idempotency, consent withdrawal and pilot isolation. Production text practice through replay and fresh-browser denial passed against real Neon. Agent settings, all six premade voices, and authenticated public SSE passed read-only preflight without voice minutes. Migrations 0006 and 0007 are applied. Full bot matrix, human gold-set thresholds, longitudinal pilot results, and final live voice/audio remain separate gates. Atkinson is bundled locally with its OFL license, removing the earlier Google Fonts build/cache dependency.

---

## M5 Real world

### [~] T20 Practice Calls

Consent flow with phone verification, schedule, cron, outbound call via ElevenLabs Twilio API, identification first message, stop phrase, revocation. Everything in `docs/SAFETY.md` section 5.

```text
Read AGENTS.md, docs/SAFETY.md section 5 and docs/API.md (Practice Calls). Do T20 in PLANS.md. Everything stays behind PRACTICE_CALLS_ENABLED.
Implement beginPhoneVerification (Twilio Verify), confirmPracticeCalls (store consent with consent_text_version; encrypt the phone with AES-256-GCM using PHONE_ENCRYPTION_KEY), revokePracticeCalls (delete the phone within the same request). app/api/cron/practice-calls/route.ts (Bearer CRON_SECRET): select due consents within each user's local window (never before 08:00 or after 21:00 local), at most maxPerWeek, create a drill with mode practice_call via the curriculum, place the call with POST /v1/convai/twilio/outbound-call using conversation_initiation_client_data { user_id, custom_llm_extra_body: { drill_id }, conversation_config_override: { agent: { first_message: IDENTIFICATION + persona.firstMessage }, tts: { voice_id } } }, store conversation_id and callSid.
Stop phrase: extend decideByRules with an optional mode argument so that for practice_call drills "stop practice", "stop" or "unsubscribe" returns hang_up, and the runtime revokes consent. Add engine tests for the new rule without changing existing behavior.
Webhook: on post-call, mark practice_calls completed or no_answer. Acceptance: typecheck, test, lint pass; a dry-run flag logs the outbound payload instead of calling.
```

Implementation checkpoint: versioned consent and verified-phone actions, AES-256-GCM storage, local-window/week-limit scheduling, an overlap-safe cron worker, redacted dry-run payload logging, signed post-call/failure webhook handling, and stop-phrase revocation are in place. Both `PRACTICE_CALLS_ENABLED` and `PRACTICE_CALLS_ADULT_REVIEWED` default off. Do not mark T20 done until a teacher/adult reviews the flow, the 15-minute scheduler is available on the selected Vercel plan, and provider-connected tests pass without using a real recipient as a test fixture.

### [x] T21 Group mode

```text
Read docs/PRODUCT.md (Group) and docs/API.md (Group mode). Do T21 in PLANS.md.
Build app/facilitate/page.tsx (start a session, show the 4-letter join code large, run the call on the projector with the normal InCall component) and app/group/[code]/page.tsx (participant: one huge "Hang up now" button that records the current k once). The facilitator page publishes the current k after each caller line (polling every 2 s is fine). The replay for group drills overlays a histogram of votes by k on the PressureLine. No accounts for participants; participantKey is random per device in localStorage.
Acceptance: typecheck, test, lint pass; two browsers can run a session.
```

Implementation checkpoint: facilitator setup, four-letter join room, account-free participant vote screen, live-turn validation, once-per-device voting, and replay vote bars are implemented. Polling recovers from network errors and votes have a pending state. Two independent browser contexts on the isolated QA database verified joining, a projected text call, a single recorded vote, replay vote bars and room closure. No voice session or phone call was started.

### [~] T22 Pilot instruments

```text
Read docs/TESTING.md (Pilot protocol). Do T22 in PLANS.md.
Add a consented pilot flow behind PILOT_ENABLED: consent page; pre survey (5 Likert items entered from the cited paper by an admin into a config file, not hard-coded here); holdout drill assignment (persona chosen per participant and excluded from their curriculum); post and retention reminders; admin CSV export of anonymized results (outcome class and score per phase, survey totals). Acceptance: typecheck, test, lint pass.
```

Implementation checkpoint: gated consent and withdrawal, five-item config validation, pre/post/retention survey forms, unseen holdout reservation, new assessment costumes, in-app follow-up prompts, assessment isolation from skills, and an admin-only pseudonymous CSV export are implemented. Pilot database integration and protocol tests pass on an isolated QA branch. `PILOT_ENABLED` remains false; the shipped config has no source items and `adultReviewed=false`. An admin must verify and enter the cited items/scoring and an adult must review the actual consent and longitudinal flow before enrollment. No survey responses or learning effects have been fabricated.

---

## M6 Ship

### [~] T23 Deploy, observability, retention, demo seed

```text
Do T23 in PLANS.md.
Deploy to Vercel (Node runtime for API routes). Add Vercel Cron entries for practice calls (if enabled) and a daily job deleting judge-mode drills older than 7 days. Add structured logging (drill id, move, decidedBy, latency per step; never text) and an error tracker. Add scripts/seed-demo.ts that creates a demo coach and trainee with a few finished drills so the dashboard isn't empty in the video. Point the prod ElevenLabs agent at the prod URL. Acceptance: production smoke test of /judge voice and text.
```

Implementation checkpoint: allowlist-only structured logs, Next request-error instrumentation, daily Judge retention, and a gated `pnpm seed:demo` dry-run/apply script are in place. The dedicated Vercel project is linked and deployed at https://hang-up-theta.vercel.app, with sensitive production environment values and preview protection. The public agent uses the deployed Custom LLM endpoint; production no longer depends on ngrok. Production text/replay/privacy, auth origin checks and provider preflight pass. Final live audio, human review and any external alerting account remain open.

### [ ] T24 Demo video checklist (human)

- [ ] Record a real drill with a family member who agreed to it.
- [ ] Show: ringing phone, live call with one push-back, replay with the pressure line, Family Circle bars, 20 seconds of architecture (state machine, labels by construction, bot harness, safety).
- [ ] Say the purpose sentence, audience, tools, and the AI disclosure.
- [ ] Put the single best pilot number on screen, honestly.

Implementation checkpoint: `docs/PRESENTATION_VIDEO.md` has the three-minute run-of-show and claim boundaries. The recording, adult review, and any real pilot statistic are human tasks and remain unchecked.
