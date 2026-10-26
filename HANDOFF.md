# Hang Up — Codex handoff

## Project location and separation

- Project: **Hang Up**, a safe AI phone-scam practice app for older adults and the families who look out for them.
- Current folder: `C:\Users\janar\Documents\ChatGPT\Hang-Up`
- This is separate from the GBM research project at `C:\Users\janar\Documents\ChatGPT\Research--2026`. Do not move Hang Up back into that folder or mix its files with the MRI work.
- The Hang-Up folder currently has no Git repository/remote configured. Work is local and should be preserved; do not initialize Git or push anything unless the user asks.

## What is already done

The project kit was installed and brought to its first usable foundation. `PLANS.md` marks T01–T03 complete:

- **T01 — App scaffold:** Next.js 16 App Router, React 19, TypeScript strict mode, Tailwind v4, ESLint, pnpm, Vitest, and Playwright. Existing engine, runtime, personas, docs, and tests were retained as the reference implementation.
- **T02 — Environment validation:** `src/env.ts` validates server/client environment variables with Zod, keeps secrets server-side, checks that all six ElevenLabs voice roles are configured, and leaves Practice Calls credentials optional until that feature is enabled. `.env.example` documents the names; it contains no real credentials.
- **T03 — Visual foundation:** theme tokens, Atkinson Hyperlegible, shadcn setup, adapted ElevenLabs UI components, app shell, skip link, light/dark/high-contrast themes, saved text-size controls, and 12 tactic chips.
- The project plan was updated to mark those three tasks complete. Third-party UI source attribution is recorded in `docs/THIRD_PARTY_NOTICES.md`.

The existing scam-drill engine under `src/lib/engine/` and runtime at `src/lib/drill/runtime.ts` are working reference code. **Do not rewrite, simplify, or weaken them or their tests.** Build the app around them.

## Verification already completed

Most recent recorded checks after T03:

- `pnpm typecheck` — passed.
- `pnpm test` — passed, **93 tests across 10 files** (the original kit had 83; 10 focused tests were added during setup).
- `pnpm lint` — passed without warnings.
- `pnpm build` — passed; Next.js 16.4.3 built the app routes.

The dev server was stopped during project separation. Start a new server from the current folder with `pnpm dev` when you want to work on the app locally.

## What to do next: T04 only

The next task in order is **T04 — Database and `DrizzleDrillStore`**. Do not start T05 until T04 meets its acceptance criteria and the user approves continuing.

Before coding, read:

1. `AGENTS.md`
2. `docs/DATA_MODEL.md`
3. `src/lib/drill/runtime.ts`
4. `PLANS.md` T04 in full

T04 asks for Neon Postgres + Drizzle, migrations from the existing `src/db/schema.ts`, `drizzle.config.ts`, `src/db/client.ts`, and `src/lib/drill/drizzle-store.ts` implementing the existing `DrillStore` interface. `get(id)` must reconstruct a drill with turns ordered by sequence. `save(record)` must use a transaction, enforce optimistic version locking, append only new turns, and persist scoring/end fields. Add real-DB integration tests that cover round-trip, stale-version conflict, append-only turns, and ended-drill fields; tests should skip when `TEST_DATABASE_URL` is absent.

Use Neon serverless for app runtime; use `DATABASE_URL_UNPOOLED` for migrations. Never invent or commit credentials. The user will need to create/provide a Neon test database and configure `TEST_DATABASE_URL` (and migration credentials) to run the integration tests and apply migrations. Keep secrets in an ignored local env file or secure environment, not in Git.

After implementation, run exactly the project's required checks: `pnpm typecheck && pnpm test && pnpm lint`. Update T04 to `[x]` only when its acceptance criteria are actually met. If the docs/code conflict or DB behavior is ambiguous, stop and ask instead of guessing.

## Remaining plan

- T04 Database and DrizzleDrillStore **(next)**
- T05 Better Auth
- T06 Custom LLM route and runtime dependencies
- T07 Drill server actions
- T08 ElevenLabs agent configuration
- T09 Call screen
- T10 Replay
- T11 Home and Judge mode
- T12 Skills and item difficulty updates
- T13 Family Circle
- T14 Practice page and next-drill recommender
- T15 Callback card and settings
- T16 Bot harness
- T17 Gold-set labeling and kappa
- T18 Red-team suite
- T19 End-to-end tests and accessibility
- T20 Practice Calls
- T21 Group mode
- T22 Pilot instruments
- T23 Deployment, observability, retention, and demo seed
- T24 Demo video checklist (human task)

The plan says M2 (T06–T11) is the judge-ready-call milestone; M3 must not begin before that gate. Practice Calls stay disabled by default and require the safety/consent flow in the project docs.

## Setup and commands

- Required locally: Node.js **22.13+** and pnpm (the package manager is pinned in `package.json`). Dependencies are already installed in this project folder.
- No Neon, Resend, model-provider, or ElevenLabs credentials/accounts have been configured yet. These are introduced only as their tasks need them. Start from `.env.example`; keep all secrets server-side.
- From PowerShell:

```powershell
Set-Location 'C:\Users\janar\Documents\ChatGPT\Hang-Up'
pnpm dev
```

- Quality checks: `pnpm typecheck`, `pnpm test`, `pnpm lint`; full required sequence: `pnpm typecheck && pnpm test && pnpm lint` (use a shell that supports `&&`).
- Check current dependency versions with `pnpm view <package> version` before adding packages, as required by `AGENTS.md`.

## Copy-paste prompt for the next Codex chat

> Continue the **Hang Up** project at `C:\Users\janar\Documents\ChatGPT\Hang-Up`. This is separate from the GBM research project. Read `AGENTS.md`, `docs/DATA_MODEL.md`, `src/lib/drill/runtime.ts`, and the T04 section of `PLANS.md`. Implement **T04 only**, exactly to its acceptance criteria. Preserve the engine/runtime and all existing tests; do not start T05. First give me the short plan, then implement, run `pnpm typecheck && pnpm test && pnpm lint`, update the T04 checkbox only if acceptance criteria pass, and report changed files, verification, and open questions. Do not invent or commit secrets; pause for the real test DB credentials if required.
