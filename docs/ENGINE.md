# Engine specification

Reference implementation: `src/lib/engine/`. Golden tests: `tests/engine/`. This document and those files must agree; change both together.

## 1. Taxonomy

Tactics are what the scammer does. Weights feed the running red-flag total. Bright lines set the point of no return immediately.

| Tactic | Principle (Stajano & Wilson, or FTC) | Weight | Bright line |
| --- | --- | --- | --- |
| `authority` | Social compliance | 1 | no |
| `urgency` | Time | 2 | no |
| `fear` | Distraction | 2 | no |
| `secrecy` | FTC Never Ever: keep it secret | 4 | **yes** |
| `move_money` | FTC Never Ever: move money to protect it | 4 | **yes** |
| `unusual_payment` | FTC payment red flag (gift cards, crypto ATM, wire, cash courier) | 4 | **yes** |
| `credential_request` | Asks for a code, PIN, password or ID number | 4 | **yes** |
| `remote_access` | Asks to install software or control the computer | 4 | **yes** |
| `family_emergency` | Kindness | 2 | no |
| `prize` | Need and greed | 2 | no |
| `social_proof` | Herd | 1 | no |
| `complicity` | Dishonesty | 2 | no |

Each tactic also carries `explain` (why it works) and `habit` (what to do instead) for the replay. See `TACTIC_INFO`.

User moves:

| Group | Moves |
| --- | --- |
| Hard fails | `disclose`, `share_code`, `agree_payment`, `agree_move_money`, `agree_remote_access`, `agree_secrecy` |
| Safe | `hang_up`, `refuse`, `verify_independent`, `ask_safe_word`, `delay_consult` |
| Neutral | `ask_identity`, `question`, `comply_minor`, `unclear` |

## 2. Deciding the user's move

1. `decideByRules(text, wallet)` (exact, confidence ≥ 0.9):
   - In `practice_call` mode only, “stop practice”, “stop”, or “unsubscribe” is `hang_up` and takes precedence over other content; the runtime then revokes the trainee's Practice Call consent. A negated “I don't want to stop practice” is not an opt-out.
   - Any 4+ digit run copied from a Practice Wallet number → `disclose`, or `share_code` if it's only the code. Spoken digits ("six five oh") are normalized first. Birth month plus day or year → `disclose`.
   - Hang-up phrases → `hang_up`; safe-word phrases → `ask_safe_word`; "call my bank myself", "number on the back of my card" → `verify_independent`.
2. Otherwise `classifyMove()` with structured output (`MoveOutputSchema`). Confidence below 0.6 → `unclear`. Timeout or error → `unclear` (`decidedBy: "fallback"`).
3. Empty utterance (silence timeout) → `unclear`.

Negation rule for the classifier: "I will not buy gift cards" is `refuse`. `agree_*` only for explicit agreement; when torn, choose the other label. Hard fails from the classifier are what the gold set must check most carefully (docs/TESTING.md).

Exact acknowledgment rule: a bare "okay", "yes", "sure", "I understand", or "got it" is `comply_minor`, after the wallet-leak and safe-exit rules run. It supplies no name, account detail, code, or specific agreement. Longer replies still go to the existing rule/classifier path. This guard was added after a production model incorrectly labeled "Okay, I understand" as `disclose` following a caller's request for a name. The classifier also requires information actually present in the reply and treats its quoted input as untrusted data. Scoring constants and taxonomy are unchanged.

## 3. Director (state machine)

Stages in order: `hook → pretext → pressure → isolation → payment_ask → extraction`.

`step(state, persona, move)`:

| Move | Result |
| --- | --- |
| `hang_up` | end `user_hung_up` |
| any hard fail | end `converted`, farewell = `persona.convertedLine` |
| k ≥ 18 scammer turns | end `turn_limit`, farewell = `givesUpLine` |
| resistance (`refuse`, `verify_independent`, `ask_safe_word`, `delay_consult`, `ask_identity`, `question`) | resistance + 1; on easy, `verify_independent` ends `scammer_gave_up`; if resistance ≥ give-up threshold, end `scammer_gave_up`; else **counter-objection** in the same stage (matching trigger, else any) |
| `unclear` | rephrase in the same stage with a fresh tactic |
| `comply_minor` | advance to the next stage once the current stage has had `minTurnsPerStage` turns; else continue |

Difficulty rules:

| | easy | realistic | relentless |
| --- | --- | --- | --- |
| Give up after resistance | 2 | 4 | never |
| One verification ends the call | yes | no | no |
| Min turns per stage | 1 | 1 | 2 |
| Actor tone | slightly off, vague | plausible | calm, polished, uses wallet name and city |

Tactic choice: from the stage's `allowedTactics`, prefer ones not yet used in this stage; seeded RNG (`hashSeed(seed, personaId, k, resistance)`), so drills replay identically.

Every `speak` action carries `fallbackLine` (scripted), used whenever the Actor fails.

## 4. Actor

`buildActorPrompt()` produces `{ system, prompt }` (pass `system` as AI SDK `instructions`). Hard rules in the prompt: one line, ≤ 2 sentences, ≤ 240 characters; stay in character; fictional organization only; no phone numbers, addresses, web or crypto addresses; never explain how to commit fraud; no stage directions.

`validateLine()` rejects: empty, > 240 chars, real organization names (`BANNED_ORG_PATTERNS`), URLs, phone numbers, crypto addresses, broken character ("as an AI", "simulation", refusals), stage directions, lists. Rejected → `fallbackLine`.

## 5. Scoring

Over scammer turns k = 1..n, excluding `farewell` lines:

```
r(k)  = Σ_{i ≤ k} Σ_{tactic ∈ turn i} weight(tactic)
t*    = min{ k : r(k) ≥ θ  or  turn k has a bright-line tactic }      θ = 5
exitK = afterK of the first hard fail, else the last scammer turn
past  = max(0, exitK − t*)   (0 if t* is null)
S     = clip(100 − Σ penalty(unique hard fails) − λ·past + min(Σ bonus(unique safe moves before any fail), 20), 0, 100)   λ = 8
```

Penalties: `disclose` 40, `share_code` 40, `agree_payment` 50, `agree_move_money` 50, `agree_remote_access` 40, `agree_secrecy` 25.
Bonuses: `verify_independent` 15, `ask_safe_word` 15, `refuse` 5, `delay_consult` 5. Cap 20.

Outcome (mirrors Yu et al., JAMA Network Open 2023): any hard fail → `converted`; else `past ≤ 1` → `clean_exit`; else `skeptical`.

Replay copy uses `pointOfNoReturnK`, `turnsPastPointOfNoReturn`, `msPastPointOfNoReturn` ("You could have hung up 3 turns, about 40 seconds, earlier"), `pressure[]` (the pressure line), and `habit` (from the bright line at t*, else the heaviest tactic heard).

All constants live in `taxonomy.ts` and are starting values. Tune on pilot transcripts; record changes in this file.

## 6. Curriculum

Per-tactic outcome `o` from a drill: converted → 0 for tactics first heard at or before the fail; skeptical → 0.5; clean exit → 1. Tactics first heard after the exit get no update.

```
p     = 1 / (1 + 10^((d − θ)/400))
θ_new = θ + 32·(o − p)          (user skill on the tactic, start 1000)
d_new = d − 16·(o − p)          (item difficulty of (persona, tactic, difficulty), start easy 900 / realistic 1000 / relentless 1150)
```

Leitner boxes with intervals 1, 3, 7, 21, 60 days: o ≥ 0.75 → up one box; o < 0.25 → box 0; else stay.

`chooseNextDrill()`: weakest due tactic (all if none due) → personas that use it, preferring a different persona than last time ("same tactic, new costume") → difficulty with predicted success closest to 0.75, preferring the band 0.6–0.85.

Update skills and item difficulty in one database transaction when a drill is scored (T12).

## 7. Practice Wallet and redaction

`generateWallet(seed)` gives a fictional identity: SSN `9xx-00-xxxx` (never valid as SSN or ITIN), card `9999 …` (no network issues 9999), fictional bank, 6-digit code. Shown on screen during drills.

`redact(text, wallet)` runs before anything is stored or sent to the classifier: emails removed; spoken digits converted; any run copying 4+ wallet digits → `[practice number]`; any other run of 5+ digits → `[number removed]`.
