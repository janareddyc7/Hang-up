/**
 * Tactic taxonomy and user-move labels.
 *
 * Tactics are what the SCAMMER does. They are chosen by the Director, so every
 * scammer line is labeled by construction (never classified after the fact).
 *
 * Principles come from Stajano & Wilson, "Understanding scam victims: seven
 * principles for systems security" (CACM 54(3), 2011). Bright lines come from
 * the FTC-led "Never Ever" rules (government agencies never tell you to move
 * money to protect it, keep a call secret, or pay for a grant) plus the
 * payment/credential red flags in the FTC's 2025 older-consumer data.
 */

export const TACTICS = [
  "authority",
  "urgency",
  "fear",
  "secrecy",
  "move_money",
  "unusual_payment",
  "credential_request",
  "remote_access",
  "family_emergency",
  "prize",
  "social_proof",
  "complicity",
] as const;

export type Tactic = (typeof TACTICS)[number];

export type Principle =
  | "social_compliance"
  | "time"
  | "distraction"
  | "kindness"
  | "need_and_greed"
  | "herd"
  | "dishonesty"
  | "ftc_never_ever"
  | "ftc_payment_red_flag";

export interface TacticInfo {
  id: Tactic;
  label: string;
  principle: Principle;
  /** Weight added to the running red-flag total r(t). */
  weight: number;
  /** A bright line sets the point of no return immediately. */
  brightLine: boolean;
  /** One plain-language sentence shown in the replay. */
  explain: string;
  /** What to do instead, shown as the "habit" in the replay. */
  habit: string;
}

export const TACTIC_INFO: Record<Tactic, TacticInfo> = {
  authority: {
    id: "authority",
    label: "Authority",
    principle: "social_compliance",
    weight: 1,
    brightLine: false,
    explain: "They claimed an official title or badge so you would obey without checking.",
    habit: "Titles cost nothing. Hang up and call the organization at a number you already have.",
  },
  urgency: {
    id: "urgency",
    label: "Urgency",
    principle: "time",
    weight: 2,
    brightLine: false,
    explain: "They set a deadline so you would act before thinking.",
    habit: "Real problems can wait for a callback. Say: I'll call you back.",
  },
  fear: {
    id: "fear",
    label: "Fear",
    principle: "distraction",
    weight: 2,
    brightLine: false,
    explain: "They threatened arrest, frozen accounts or losses to keep you off balance.",
    habit: "Fear is the signal to slow down, not speed up.",
  },
  secrecy: {
    id: "secrecy",
    label: "Keep it secret",
    principle: "ftc_never_ever",
    weight: 4,
    brightLine: true,
    explain: "They told you not to tell your bank or family. No real agency asks that.",
    habit: "The moment anyone says keep this secret, hang up and tell someone.",
  },
  move_money: {
    id: "move_money",
    label: "Move money to protect it",
    principle: "ftc_never_ever",
    weight: 4,
    brightLine: true,
    explain: "They told you to move money to keep it safe. That is always a scam.",
    habit: "Your money is never safer somewhere a caller picked.",
  },
  unusual_payment: {
    id: "unusual_payment",
    label: "Unusual payment",
    principle: "ftc_payment_red_flag",
    weight: 4,
    brightLine: true,
    explain: "They asked for gift cards, a crypto ATM, a wire or cash pickup.",
    habit: "Nobody legitimate takes payment in gift cards or crypto ATMs. Hang up.",
  },
  credential_request: {
    id: "credential_request",
    label: "Asked for a code or ID number",
    principle: "ftc_payment_red_flag",
    weight: 4,
    brightLine: true,
    explain: "They asked for a one-time code, PIN, password or Social Security number.",
    habit: "Never read a code or ID number to someone who called you.",
  },
  remote_access: {
    id: "remote_access",
    label: "Remote access",
    principle: "ftc_payment_red_flag",
    weight: 4,
    brightLine: true,
    explain: "They wanted you to install software so they could control your computer.",
    habit: "Never let a caller into your computer. Close the call and restart the device.",
  },
  family_emergency: {
    id: "family_emergency",
    label: "Family emergency",
    principle: "kindness",
    weight: 2,
    brightLine: false,
    explain: "They used love for a family member to rush you.",
    habit: "Ask for the family safe word, then call the person directly.",
  },
  prize: {
    id: "prize",
    label: "Prize or windfall",
    principle: "need_and_greed",
    weight: 2,
    brightLine: false,
    explain: "They promised money you had to pay to receive.",
    habit: "If you have to pay to win, you did not win.",
  },
  social_proof: {
    id: "social_proof",
    label: "Everyone's doing it",
    principle: "herd",
    weight: 1,
    brightLine: false,
    explain: "They said others had already done what they asked.",
    habit: "Other people's choices tell you nothing about this caller.",
  },
  complicity: {
    id: "complicity",
    label: "Make you complicit",
    principle: "dishonesty",
    weight: 2,
    brightLine: false,
    explain: "They hinted you might be in trouble too, so you would stay quiet.",
    habit: "Being embarrassed is not a crime. Report it anyway.",
  },
};

/** Threshold θ on the running red-flag total r(t). Tune on pilot data. */
export const PONR_THRESHOLD = 5;

/**
 * User moves. The first group are hard fails: the rule engine or the
 * classifier marks them, and any one makes the call "converted".
 */
export const HARD_FAILS = [
  "disclose",
  "share_code",
  "agree_payment",
  "agree_move_money",
  "agree_remote_access",
  "agree_secrecy",
] as const;
export type HardFail = (typeof HARD_FAILS)[number];

export const SAFE_MOVES = [
  "hang_up",
  "refuse",
  "verify_independent",
  "ask_safe_word",
  "delay_consult",
] as const;
export type SafeMove = (typeof SAFE_MOVES)[number];

export const NEUTRAL_MOVES = ["ask_identity", "question", "comply_minor", "unclear"] as const;
export type NeutralMove = (typeof NEUTRAL_MOVES)[number];

export type UserMove = HardFail | SafeMove | NeutralMove;
export const USER_MOVES: readonly UserMove[] = [...HARD_FAILS, ...SAFE_MOVES, ...NEUTRAL_MOVES];

export const HARD_FAIL_PENALTY: Record<HardFail, number> = {
  disclose: 40,
  share_code: 40,
  agree_payment: 50,
  agree_move_money: 50,
  agree_remote_access: 40,
  agree_secrecy: 25,
};

export const MOVE_BONUS: Partial<Record<UserMove, number>> = {
  verify_independent: 15,
  ask_safe_word: 15,
  refuse: 5,
  delay_consult: 5,
};

/** Bonus total is capped so verifying can't erase a hard fail. */
export const MAX_BONUS = 20;
/** λ: points lost per scammer turn the user stays on past the point of no return. */
export const DELAY_PENALTY_PER_TURN = 8;
/** Turns past the point of no return still counted as a clean exit. */
export const CLEAN_EXIT_GRACE_TURNS = 1;

export function isHardFail(move: UserMove): move is HardFail {
  return (HARD_FAILS as readonly string[]).includes(move);
}

/** Moves that push back on the scammer; the Director answers these with counter-objections. */
export const RESISTANCE_MOVES: readonly UserMove[] = [
  "refuse",
  "verify_independent",
  "ask_safe_word",
  "delay_consult",
  "ask_identity",
  "question",
];
