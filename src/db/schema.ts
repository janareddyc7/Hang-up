/**
 * Application tables (Drizzle ORM, Postgres). Better Auth owns user/session/account/verification.
 * Rules:
 * - Transcript text is stored REDACTED only (see src/lib/engine/wallet.ts redact()).
 * - drills.version implements optimistic locking for DrillStore.save().
 * - Anonymous Judge-mode drills have user_id = null and are deleted after 7 days.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { DrillState } from "../lib/engine/director";
import type { PracticeWallet } from "../lib/engine/schema";
import type { ScoreResult } from "../lib/engine/scoring";
import { user } from "./auth-schema";

export { account, session, user, verification } from "./auth-schema";

export const difficultyEnum = pgEnum("difficulty", ["easy", "realistic", "relentless"]);
export const drillModeEnum = pgEnum("drill_mode", ["judge", "sparring", "assigned", "practice_call", "group"]);
export const drillStatusEnum = pgEnum("drill_status", ["live", "ended"]);
export const endReasonEnum = pgEnum("end_reason", ["user_hung_up", "scammer_gave_up", "converted", "turn_limit", "error"]);
export const outcomeEnum = pgEnum("outcome", ["converted", "skeptical", "clean_exit"]);
export const speakerEnum = pgEnum("speaker", ["scammer", "user"]);
export const circleRoleEnum = pgEnum("circle_role", ["coach", "trainee"]);

export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  /** UI preferences for older users. */
  textScale: real("text_scale").notNull().default(1),
  speechRate: real("speech_rate").notNull().default(1),
  highContrast: boolean("high_contrast").notNull().default(false),
  prefersText: boolean("prefers_text").notNull().default(false),
  safeWordSet: boolean("safe_word_set").notNull().default(false), // the word itself is never stored
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const drills = pgTable(
  "drills",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    /** SHA-256 of the browser-only Judge session token for anonymous drills. */
    judgeSessionHash: text("judge_session_hash"),
    personaId: text("persona_id").notNull(),
    personaVersion: integer("persona_version").notNull().default(1),
    difficulty: difficultyEnum("difficulty").notNull(),
    mode: drillModeEnum("mode").notNull(),
    /** Assignment that launched this drill, if any; links completion back to the coach's task. */
    assignmentId: text("assignment_id"),
    isAssessment: boolean("is_assessment").notNull().default(false),
    seed: text("seed").notNull(),
    status: drillStatusEnum("status").notNull().default("live"),
    endReason: endReasonEnum("end_reason"),
    state: jsonb("state").$type<DrillState>().notNull(),
    wallet: jsonb("wallet").$type<PracticeWallet>().notNull(),
    elevenlabsConversationId: text("elevenlabs_conversation_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    score: smallint("score"),
    outcome: outcomeEnum("outcome"),
    scoreDetail: jsonb("score_detail").$type<ScoreResult>(),
    /** Set transactionally after per-user skills and shared item difficulty update. */
    skillsAppliedAt: timestamp("skills_applied_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    index("drills_user_started_idx").on(t.userId, t.startedAt),
    index("drills_conversation_idx").on(t.elevenlabsConversationId),
  ],
);

export const turns = pgTable(
  "turns",
  {
    id: serial("id").primaryKey(),
    drillId: text("drill_id").notNull().references(() => drills.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    speaker: speakerEnum("speaker").notNull(),
    /** Scammer turns: k. User turns: number of scammer turns heard before (afterK). */
    k: integer("k").notNull(),
    stage: text("stage"),
    tactics: text("tactics").array().notNull().default(sql`'{}'::text[]`),
    move: text("move"),
    confidence: real("confidence"),
    decidedBy: text("decided_by"),
    source: text("source"),
    /** Always redacted. */
    text: text("text").notNull(),
    tMs: integer("t_ms").notNull(),
  },
  (t) => [uniqueIndex("turns_drill_seq_idx").on(t.drillId, t.seq)],
);

/** Per-user skill on each tactic (Elo rating + Leitner box). */
export const skills = pgTable(
  "skills",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    tactic: text("tactic").notNull(),
    theta: real("theta").notNull().default(1000),
    box: smallint("box").notNull().default(0),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
    lastPersonaId: text("last_persona_id"),
    exposures: integer("exposures").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tactic] })],
);

/** Calibrated difficulty of each (persona, tactic, difficulty) item, shared across users. */
export const itemDifficulty = pgTable(
  "item_difficulty",
  {
    personaId: text("persona_id").notNull(),
    tactic: text("tactic").notNull(),
    difficulty: difficultyEnum("difficulty").notNull(),
    d: real("d").notNull(),
    n: integer("n").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.personaId, t.tactic, t.difficulty] })],
);

export const circles = pgTable("circles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const circleMembers = pgTable(
  "circle_members",
  {
    circleId: text("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: circleRoleEnum("role").notNull(),
    /** Trainee's choice: coaches see scores only unless this is true. */
    shareTranscripts: boolean("share_transcripts").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.circleId, t.userId] })],
);

export const circleInvites = pgTable("circle_invites", {
  id: text("id").primaryKey(),
  circleId: text("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  /** Normalized recipient address binds acceptance to the invited account. */
  email: text("email").notNull(),
  role: circleRoleEnum("role").notNull(),
  /** SHA-256 of the invite token; the token itself is only in the emailed link. */
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("circle_invites_pending_email_idx").on(t.circleId, t.email).where(sql`${t.acceptedAt} is null`),
]);

export const assignments = pgTable("assignments", {
  id: text("id").primaryKey(),
  circleId: text("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  coachId: text("coach_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  traineeId: text("trainee_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  /** null = let the adaptive curriculum choose. */
  personaId: text("persona_id"),
  difficulty: difficultyEnum("difficulty"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  completedDrillId: text("completed_drill_id").references(() => drills.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Practice Calls: the trainee's own consent. Off unless a row exists and revokedAt is null. */
export const practiceCallConsents = pgTable("practice_call_consents", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  /** E.164. Encrypt at rest (see docs/SAFETY.md). */
  phoneE164Encrypted: text("phone_e164_encrypted").notNull(),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  consentTextVersion: text("consent_text_version").notNull(),
  consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
  daysOfWeek: smallint("days_of_week").array().notNull(), // 0 = Sunday
  windowStartMinute: smallint("window_start_minute").notNull(),
  windowEndMinute: smallint("window_end_minute").notNull(),
  timezone: text("timezone").notNull(),
  maxPerWeek: smallint("max_per_week").notNull().default(1),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const practiceCalls = pgTable("practice_calls", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  drillId: text("drill_id").references(() => drills.id, { onDelete: "set null" }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  placedAt: timestamp("placed_at", { withTimezone: true }),
  elevenlabsConversationId: text("elevenlabs_conversation_id"),
  twilioCallSid: text("twilio_call_sid"),
  status: text("status").notNull().default("scheduled"), // scheduled | placing | placed | completed | no_answer | stopped | failed
}, (t) => [
  index("practice_calls_user_scheduled_idx").on(t.userId, t.scheduledFor),
  uniqueIndex("practice_calls_conversation_idx").on(t.elevenlabsConversationId).where(sql`${t.elevenlabsConversationId} is not null`),
]);

/** Human labels for the gold set (scoring calibration). */
export const moveLabels = pgTable("move_labels", {
  id: serial("id").primaryKey(),
  turnId: integer("turn_id").notNull().references(() => turns.id, { onDelete: "cascade" }),
  labeledBy: text("labeled_by").notNull().references(() => user.id),
  move: text("move").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("move_labels_turn_id_unique").on(t.turnId)]);

/** "This tag looks wrong" flags from the replay screen. */
export const tagFlags = pgTable("tag_flags", {
  id: serial("id").primaryKey(),
  turnId: integer("turn_id").notNull().references(() => turns.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupSessions = pgTable("group_sessions", {
  id: text("id").primaryKey(),
  facilitatorId: text("facilitator_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  joinCode: text("join_code").notNull().unique(),
  drillId: text("drill_id").references(() => drills.id, { onDelete: "set null" }),
  status: text("status").notNull().default("open"), // open | live | closed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupVotes = pgTable(
  "group_votes",
  {
    sessionId: text("session_id").notNull().references(() => groupSessions.id, { onDelete: "cascade" }),
    participantKey: text("participant_key").notNull(), // random per-device id, no account needed
    k: integer("k").notNull(), // scammer turn at which they voted "hang up now"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.participantKey] })],
);

/** Pilot study instruments (pre/post Susceptibility to Scams scale, holdout results). */
export const surveyResponses = pgTable("survey_responses", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  instrument: text("instrument").notNull(), // "scam_susceptibility_5" | "holdout_drill"
  phase: text("phase").notNull(), // "pre" | "post" | "retention"
  answers: jsonb("answers").$type<Record<string, number | string>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Study participation stays separate from ordinary practice and transcript sharing. */
export const pilotParticipants = pgTable("pilot_participants", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  participantId: text("participant_id").notNull().unique(),
  holdoutPersonaId: text("holdout_persona_id").notNull(),
  consentVersion: text("consent_version").notNull(),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull().defaultNow(),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
});

export const pilotAssessments = pgTable("pilot_assessments", {
  userId: text("user_id").notNull().references(() => pilotParticipants.userId, { onDelete: "cascade" }),
  phase: text("phase").$type<"pre" | "post" | "retention">().notNull(),
  answers: jsonb("answers").$type<number[]>().notNull(),
  surveyTotal: real("survey_total").notNull(),
  drillId: text("drill_id").references(() => drills.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.phase] })]);
