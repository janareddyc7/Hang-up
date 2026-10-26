# Design and themes

The design borrows from the world it trains for: phone screens, caller ID, recent-call lists. The one memorable element is the **pressure line** on the replay. Everything else is quiet, large and legible for readers over 65.

Tokens: `src/styles/theme.css`. Never hard-code a color in a component.

## Principles

1. **Legible first.** 18px body minimum, 16px absolute minimum, 48px touch targets, 72px Hang Up button. Line length under 70 characters.
2. **Color means something.** Red is scammer bright lines and the Hang Up button. Green is a clean exit. Yellow is the point of no return. Nothing is colored for decoration.
3. **One bold moment per screen.** Call screen: the ringing phone. Replay: the pressure line. Dashboard: none, just clarity.
4. **Calm voice.** Feedback is about skill, never gullibility.
5. **Never color alone.** Every chip has a text label; every status has a word.

## Themes

| Theme | When | Notes |
| --- | --- | --- |
| Light (default) | Everyday use | Cool paper `#F4F6F9`, navy ink `#14213D`, phone-blue accent `#2350C8` |
| Dark | System preference or user toggle | Navy surfaces, lifted accents; same meanings |
| High contrast | User setting (`data-contrast="high"` on `<html>`) | Pure black on white, black hairlines, no tints |
| Call surface | Always, on the call screen | Fixed phone look: `#0F1A30` background, white text, red `#D32F2F` hang up, green `#23804A` answer |

All text pairs meet WCAG AA (checked: ink/paper 14.8:1, muted/paper 6.6:1, white on accent 6.9:1, white on signal 5.6:1, white on hang-up 5.0:1, white on answer 4.9:1).

## Typography

- **Atkinson Hyperlegible Next** (Google Fonts), designed by the Braille Institute for low-vision readers, so letters like I, l and 1 never blur together. The Latin variable font is bundled under `src/assets/fonts` with its OFL license and loaded with `next/font/local` as `--font-atkinson`, covering weights 400, 600, 700. This preserves the typeface while making clean builds independent of Google Fonts and avoiding the Next dev font-metric warning.
- One family for everything. Tabular numerals on (scores, timestamps).
- Scale (rem at 16px root): 16, 18 (body), 21, 26, 34, 44, 56 (caller name on the call screen).
- Sentence case everywhere. No all-caps labels. No monospace.

## Screens

### Home: recent calls

The scenario list looks like a phone's recent-calls list, because that is what these are.

```
┌──────────────────────────────────────────────┐
│ Hang Up                          [Text size] │
│                                              │
│ Practice saying no before a real scammer     │
│ calls.                                       │
│                                              │
│ [ Take a practice call ]  (primary, large)   │
│                                              │
│ Recent calls                                 │
│ ──────────────────────────────────────────── │
│ ☎  Washington, DC            Missed, 2m ago  │
│    Federal agent says your savings are at    │
│    risk                          [Answer]    │
│ ──────────────────────────────────────────── │
│ ☎  Unknown caller           Missed, 14m ago  │
│    Your grandson is in jail and needs bail   │
│                                  [Answer]    │
└──────────────────────────────────────────────┘
```

Left-aligned. The "Missed, 2m ago" times are decorative fiction, generated per visit, never real.

### Incoming call (the one orchestrated motion)

```
┌───────────────────────┐   call-surface, full viewport on phones,
│                       │   centered 420px column on desktop
│     Washington, DC    │   caller ID: 56px
│   Incoming call...    │
│                       │
│        ( ◉ )          │   avatar circle with ring-halo animation
│                       │
│  Your practice wallet │   collapsible card: fake name, bank,
│  Pat Rivera ▸         │   card, plus an unread "New text" holding the code
│                       │
│  (Decline)  (Answer)  │   72px round buttons; Decline = red, Answer = green
└───────────────────────┘
```

`ringing` + `ringing-shake` utilities; respect `prefers-reduced-motion` (show a static "Incoming call" label instead). Optional ringtone audio, muted until the user taps (browsers block autoplay).

### In call

```
┌───────────────────────┐
│ Agent Daniel Reyes    │
│ Washington, DC  01:12 │
│                       │
│ "Do not discuss this  │   live captions, 26px, last two lines only
│  with anyone at your  │
│  bank."               │
│                       │
│   ~ waveform ~        │   ElevenLabs UI live waveform / orb
│                       │
│ [Mute] [Keypad] [Text]│   Text switches to typed replies
│                       │
│      ( Hang up )      │   72px, red
└───────────────────────┘
```

No score or hints during the call. The point is to feel the pressure.

### Replay: the pressure line

The signature visual. A vertical line runs down the left gutter of the transcript; its fill rises with r(k), shading from `--pressure-low` to `--pressure-high`. A yellow rule crosses the transcript at the point of no return: "This is where to hang up."

```
┌──────────────────────────────────────────────────────────────────┐
│ You stayed on 3 turns after the red flag.          Score 76      │
│ Skeptical: you didn't give anything away, but you stayed on.    │
│                                                                  │
│ ▌ Caller  Good afternoon, this is Agent Daniel Reyes...  [Authority]
│ ▌ You     Who is this again?                                     │
│ ▌ Caller  Your information was found on accounts...      [Fear]  │
│ █ You     Oh no. What do I do?                                   │
│ █ Caller  Do not discuss this with your bank.   [Keep it secret] │  ← red solid chip
│ ━━━━━━━━━━━ This is where to hang up ━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ← caution yellow
│ █ You     Okay, I won't.                                         │
│ █ ...                                                            │
│                                                                  │
│ Next time: The moment anyone says keep this secret, hang up      │
│ and tell someone.                                                │
│ [ Practice this again ]   [ Print my callback card ]             │
└──────────────────────────────────────────────────────────────────┘
```

Desktop: transcript 60ch on the left, summary panel on the right (sticky). Mobile: summary first, then transcript. Tapping a chip opens a short explainer (`TACTIC_INFO.explain`) and a "This tag looks wrong" link (writes `tag_flags`).

Chips: tinted background (12% of the tactic hue over surface), 1px border in the hue, ink-colored label. Bright-line chips: solid `--signal` with white label.

### Family dashboard

Per-tactic horizontal bars (skill θ mapped to Practicing / Getting there / Strong), sorted weakest first, each with its next due date. Assign button per trainee. No charts beyond that.

### Callback card

Printable 5×3 inch card: "Before you send money or share a code, hang up and call:" with the user's own bank number (typed by them, stored only in the browser for printing), family numbers, and "Our safe word is ________" left blank to fill by hand. The safe word is never stored.

## Components

Use shadcn/ui primitives (Button, Dialog, Sheet, Tabs, Tooltip, Switch, Slider) and ElevenLabs UI (`orb`, `live-waveform`, `conversation`, `message`) restyled with our tokens. Build these ourselves:

| Component | Notes |
| --- | --- |
| `IncomingCall` | Caller ID, ring motion, Answer/Decline; triggers `startSession` on Answer |
| `InCall` | Captions from `onMessage`, timer, Mute, Text, Hang up; inside `ConversationProvider` |
| `PracticeWallet` | Collapsible fake ID plus an unread "New text" message holding the one-time code |
| `PressureLine` | SVG, height = transcript height, points from `ScoreResult.pressure` |
| `TacticChip` | Label + hue from tactic; bright lines solid red |
| `PonrRule` | Yellow rule + caption at `pointOfNoReturnK` |
| `ScoreSummary` | Score, outcome sentence, habit, next action |
| `SkillBars` | Dashboard bars by tactic |

## Copy

Plain verbs, sentence case, specific. Buttons say what happens: "Take a practice call", "Hang up", "Practice this again", "Print my callback card".

| Moment | Copy |
| --- | --- |
| Clean exit | "You hung up before they could push you. That's the habit." |
| Skeptical | "You didn't give anything away, but you stayed on {n} turns after the red flag." |
| Converted | "They got the code. This is the moment it happened, and what to say next time." |
| Scammer gave up | "They gave up. Next time, you can hang up even sooner." |
| Model or network trouble | "The call dropped. Your practice so far is saved." |
| Empty history | "No practice calls yet. Your first one takes about two minutes." |

Never: "You failed", "You were fooled", "Gotcha".

## Accessibility checklist

- Keyboard: Answer, Hang up, Text toggle reachable and visible focus (3px ring).
- Screen readers: captions in an `aria-live="polite"` region; chips readable as "Tactic: Keep it secret, bright line".
- Text size control (1.0×, 1.25×, 1.5×) persisted in `profiles.text_scale`.
- Speech speed control passed as ElevenLabs `tts.speed` override.
- Reduced motion respected; no autoplaying sound.
- Run axe in Playwright on every page (T19).
