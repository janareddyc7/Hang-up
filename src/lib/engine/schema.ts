import { z } from "zod";
import { TACTICS, USER_MOVES, HARD_FAILS } from "./taxonomy";

export const TacticSchema = z.enum(TACTICS);
export const UserMoveSchema = z.enum(USER_MOVES as unknown as [string, ...string[]]);
export const HardFailSchema = z.enum(HARD_FAILS);

export const STAGES = ["hook", "pretext", "pressure", "isolation", "payment_ask", "extraction"] as const;
export const StageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof StageSchema>;

export const DIFFICULTIES = ["easy", "realistic", "relentless"] as const;
export const DifficultySchema = z.enum(DIFFICULTIES);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const CategorySchema = z.enum([
  "government_impersonation",
  "benefits_impersonation",
  "family_emergency",
  "tech_support",
  "bank_fraud_department",
  "prize",
]);

export const PaymentMethodSchema = z.enum([
  "gift_cards",
  "crypto_atm",
  "wire",
  "cash_courier",
  "bank_transfer",
  "remote_access",
  "one_time_code",
]);

/** Voice roles map to premade ElevenLabs voice IDs in config, never to cloned voices. */
export const VoiceRoleSchema = z.enum([
  "official_male",
  "official_female",
  "young_adult_male",
  "young_adult_female",
  "technician",
  "upbeat_host",
]);

const Line = z.string().min(8).max(240);

export const StageSpecSchema = z.object({
  objective: z.string().min(10),
  allowedTactics: z.array(TacticSchema).min(1),
  /** Scripted fallback lines; used when the model fails or in offline Judge mode. */
  fallbackLines: z.array(Line).min(2),
});

export const CounterObjectionSchema = z.object({
  trigger: z.enum(["refuse", "verify_independent", "ask_identity", "delay_consult", "question", "ask_safe_word"]),
  tactic: TacticSchema,
  lines: z.array(Line).min(1),
});

/** Organization names spoken by the caller must be fictional (see docs/SAFETY.md). */
export const PersonaCardSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    version: z.number().int().positive(),
    title: z.string().min(4),
    category: CategorySchema,
    /** Source category in the FTC's 2025 data that this drill rehearses. */
    ftcSource: z.string().min(4),
    callerName: z.string().min(2),
    organization: z.string().min(2),
    callerIdDisplay: z.string().min(2).max(40),
    voiceRole: VoiceRoleSchema,
    pretext: z.string().min(20),
    goal: z.object({
      paymentMethod: PaymentMethodSchema,
      amountUsd: z.number().int().nonnegative(),
    }),
    firstMessage: Line,
    stages: z.object({
      hook: StageSpecSchema,
      pretext: StageSpecSchema,
      pressure: StageSpecSchema,
      isolation: StageSpecSchema,
      payment_ask: StageSpecSchema,
      extraction: StageSpecSchema,
    }),
    counterObjections: z.array(CounterObjectionSchema).min(4),
    givesUpLine: Line,
    convertedLine: Line,
    teachingPoints: z.array(z.string().min(10)).min(2).max(5),
  })
  .strict();

export type PersonaCard = z.infer<typeof PersonaCardSchema>;
export type StageSpec = z.infer<typeof StageSpecSchema>;

/** A fictional identity the user may "leak" during a drill. All numbers are invalid in the real world. */
export const PracticeWalletSchema = z.object({
  fullName: z.string(),
  city: z.string(),
  dateOfBirth: z.string(), // "March 4, 1951"
  ssn: z.string().regex(/^9\d{2}-00-\d{4}$/), // area 9xx + group 00: never a valid SSN or ITIN
  bankName: z.string(),
  accountNumber: z.string().regex(/^\d{10}$/),
  cardNumber: z.string().regex(/^9999 \d{4} \d{4} \d{4}$/),
  oneTimeCode: z.string().regex(/^\d{6}$/),
});
export type PracticeWallet = z.infer<typeof PracticeWalletSchema>;

export const ScammerTurnSchema = z.object({
  speaker: z.literal("scammer"),
  /** 1-based count of scammer turns. */
  k: z.number().int().positive(),
  stage: StageSchema,
  tactics: z.array(TacticSchema),
  text: z.string(),
  /** "farewell" lines (gave up / converted) are spoken but excluded from scoring. */
  source: z.enum(["model", "fallback", "first_message", "farewell"]),
  tMs: z.number().int().nonnegative(),
});

export const UserTurnSchema = z.object({
  speaker: z.literal("user"),
  /** Number of scammer turns heard before this user turn. */
  afterK: z.number().int().nonnegative(),
  text: z.string(), // already redacted
  move: UserMoveSchema,
  confidence: z.number().min(0).max(1),
  decidedBy: z.enum(["rule", "classifier", "fallback"]),
  tMs: z.number().int().nonnegative(),
});

export const TurnSchema = z.discriminatedUnion("speaker", [ScammerTurnSchema, UserTurnSchema]);
export type ScammerTurn = z.infer<typeof ScammerTurnSchema>;
export type UserTurn = z.infer<typeof UserTurnSchema>;
export type Turn = z.infer<typeof TurnSchema>;

export const EndReasonSchema = z.enum([
  "user_hung_up",
  "scammer_gave_up",
  "converted",
  "turn_limit",
  "error",
]);
export type EndReason = z.infer<typeof EndReasonSchema>;
