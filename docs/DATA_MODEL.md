# Data model

Source of truth: `src/db/schema.ts` (Drizzle, Postgres). Better Auth generates `user`, `session`, `account`, `verification` into `src/db/auth-schema.ts` (the kit ships a placeholder so the schema type-checks).

## Tables

| Table | Purpose | Key points |
| --- | --- | --- |
| `profiles` | Display name and accessibility/call preferences | `text_scale`, `speech_rate`, `high_contrast`, `prefers_text`; `safe_word_set` is a boolean and the word itself is never stored |
| `drills` | One practice call | `state` (DrillState JSON), `wallet` (PracticeWallet JSON), `score_detail` (ScoreResult JSON), `version` for optimistic locking, `skills_applied_at` for idempotent T12 updates, optional `assignment_id`, `user_id` null in Judge mode |
| `turns` | Ordered turns of a drill | `seq` unique per drill; scammer `k` or user `afterK` in `k`; `text` is always redacted |
| `skills` | Per user per tactic: Elo θ, Leitner box, due date | Primary key (user, tactic) |
| `item_difficulty` | Shared difficulty per (persona, tactic, difficulty) | Updated on every scored drill |
| `circles`, `circle_members`, `circle_invites` | Family Circle | Invite tokens stored hashed; normalized invite email binds acceptance; `share_transcripts` chosen by trainee and defaults off |
| `assignments` | Coach-assigned drills | `persona_id` null means "let the curriculum choose"; completed drill is linked back to the assignment |
| `practice_call_consents`, `practice_calls` | Phase 4 | Phone stored encrypted; consent text versioned; `revoked_at`; call reservation and webhook lookup indexes |
| `move_labels`, `tag_flags` | Gold set and user flags | One human label per turn; notes are redacted before storage; feeds calibration (docs/TESTING.md) |
| `group_sessions`, `group_votes` | Group mode | Participants need no account |
| `survey_responses` | Pilot instruments | Pre, post, retention |
| `pilot_participants` | Versioned consent and a previously unseen holdout | Separate random participant identifier; withdrawal timestamp |
| `pilot_assessments` | Five numeric answers, configured total and reserved assessment drill | One row per participant/phase; removed on withdrawal |

## DrillStore mapping (T04)

`DrillStore.get(id)` loads `drills` + `turns` ordered by `seq` and rebuilds `DrillRecord`. `DrillStore.save(record)`:

1. In a transaction: `UPDATE drills SET ..., version = $new WHERE id = $id AND version = $new - 1` (insert when `version = 1`).
2. If 0 rows updated → throw (the runtime treats it as a conflict and repeats the last line).
3. Insert only turns with `seq` greater than the stored max (turns are append-only).

## Retention

| Data | Kept |
| --- | --- |
| Judge-mode drills (`user_id` null) | 7 days, then deleted by a daily cron |
| Signed-in drills | Until the user deletes them or their account |
| ElevenLabs conversation history | Set the agent's retention to the shortest workable period; audio saving off |
| Practice Call phone numbers | Until consent is revoked, then deleted immediately |
| Callback-card bank/family numbers | Browser `localStorage` only; never sent to the server |

## Indexes worth having

`drills (user_id, started_at desc)`, `drills (elevenlabs_conversation_id)`, `turns (drill_id, seq)` unique, `skills (user_id, due_at)`, `practice_calls (user_id, scheduled_for)`, and unique non-null `practice_calls.elevenlabs_conversation_id`.
