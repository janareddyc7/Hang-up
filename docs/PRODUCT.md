# Product

**Hang Up lets anyone rehearse beating real scam tactics against an AI caller, then shows exactly where the scammer got to them.**

Older adults reported about $3 billion in fraud losses to the FTC in 2025, five times the 2020 figure; phone scams carry the highest median loss ($3,000). Warnings fade and fail under pressure; rehearsal under pressure is what builds the reflex. Hang Up is fire drills for phone scams.

## Who it's for

| Person | Wants | Gets |
| --- | --- | --- |
| Judge (Congressional App Challenge) | Feel the idea in 60 seconds | Judge mode: no login, three curated calls, graded replay |
| Trainee (often 65+) | Not be fooled, not feel stupid | Short drills, calm feedback, one habit at a time |
| Coach (often a grandchild) | Help a parent or grandparent | Family Circle: assign drills, see progress by tactic |
| Facilitator (senior center, library, classroom) | Run a group session | Group mode: projected call, room votes when to hang up |

## Modes

1. **Sparring**: pick a scenario and difficulty, take the call, see the replay. Works signed out (Judge mode) and signed in (adds skills tracking).
2. **Family Circle**: coach invites trainee by email; coach assigns drills or lets the curriculum choose; trainee controls whether transcripts are shared (default: scores only).
3. **Practice Calls** (phase 4, off by default): the trainee's own phone rings in windows they chose. Every call opens with "This is a Hang Up practice call." Stop phrase ends and unenrolls.
4. **Group**: facilitator screen plays the call; participants join with a code on their phones and tap "Hang up now" when they would; replay shows when the room voted vs the point of no return.

Every mode supports **text mode** (same engine, typed messages) for anyone who can't or won't use a microphone.

## Screens and routes

| Route | Screen | Auth |
| --- | --- | --- |
| `/` | Home: "Recent calls" list of scenarios, each looks like a missed call; one primary action: Take a practice call | public |
| `/judge` | Judge mode: three curated calls, one-line intro, start in one tap | public |
| `/call/[scenario]` | Incoming call → in-call → hang up | public in Judge mode, else user |
| `/replay/[drillId]` | Pressure line, transcript with tactic chips, point of no return, score, outcome, habit | owner, or coach if shared |
| `/practice` | Your next practice call (curriculum pick) + history | user |
| `/circle` | Family Circle dashboard: members, per-tactic bars, assignments | user |
| `/circle/invite/[token]` | Accept invite | public |
| `/card` | Callback card + safe word setup (printable) | user |
| `/settings` | Text size, speech speed, contrast, text mode, Practice Calls consent | user |
| `/group/[code]` | Group participant view | public |
| `/facilitate` | Group facilitator console | user |
| `/admin/labels` | Gold-set labeling (allowlisted admins) | admin |

## Core journeys

**Judge (60 seconds).** `/judge` → taps "Federal agent says your savings are at risk" → phone rings → answers → agent pushes; judge says "I'll call the agency myself" → agent counters ("You're already speaking to the Federal Consumer Safety Office") → judge hangs up → replay: chips, red-flag line crossing the threshold at turn 3, score 84, "You could have hung up 2 turns earlier", habit: "The moment anyone says keep this secret, hang up and tell someone."

**Grandparent with a grandchild.** Grandchild creates a circle, invites grandma (magic link) → grandma's first session is three placement calls with the grandchild beside her → they set a safe word together and print the callback card → weekly assigned drills; the dashboard shows "Authority: strong. Urgency: needs practice."

**Senior center.** Facilitator opens `/facilitate`, room joins with a 4-letter code, call plays on the projector, people tap "Hang up now" → replay overlays the room's votes on the pressure line → discussion.

## Scenario library (launch)

Six persona cards in `content/personas/`, each tied to an FTC 2025 data category: federal agent / savings at risk, benefits suspension, grandchild in jail, tech support, bank fraud department code request, sweepstakes fees. All organization names are fictional.

## Non-goals

- Detecting or blocking real scam calls (other apps do this).
- Voice cloning of family members (never).
- Collecting real personal or financial data (the Practice Wallet exists so nobody has to).
- Medical or cognitive assessment.

## What success looks like

- A judge completes a call and reaches the replay without help.
- Drill completion rate is high (the UCSD phishing study found more than half of training sessions abandoned within 10 seconds; we should be far better).
- Pilot: trainees move from converted or skeptical toward clean exit on a scenario they never practiced (docs/TESTING.md).
