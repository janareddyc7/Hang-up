CREATE TYPE "public"."circle_role" AS ENUM('coach', 'trainee');--> statement-breakpoint
CREATE TYPE "public"."difficulty" AS ENUM('easy', 'realistic', 'relentless');--> statement-breakpoint
CREATE TYPE "public"."drill_mode" AS ENUM('judge', 'sparring', 'assigned', 'practice_call', 'group');--> statement-breakpoint
CREATE TYPE "public"."drill_status" AS ENUM('live', 'ended');--> statement-breakpoint
CREATE TYPE "public"."end_reason" AS ENUM('user_hung_up', 'scammer_gave_up', 'converted', 'turn_limit', 'error');--> statement-breakpoint
CREATE TYPE "public"."outcome" AS ENUM('converted', 'skeptical', 'clean_exit');--> statement-breakpoint
CREATE TYPE "public"."speaker" AS ENUM('scammer', 'user');--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text NOT NULL,
	"coach_id" text NOT NULL,
	"trainee_id" text NOT NULL,
	"persona_id" text,
	"difficulty" "difficulty",
	"due_at" timestamp with time zone,
	"completed_drill_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circle_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text NOT NULL,
	"role" "circle_role" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "circle_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "circle_members" (
	"circle_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "circle_role" NOT NULL,
	"share_transcripts" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circle_members_circle_id_user_id_pk" PRIMARY KEY("circle_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "circles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drills" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"persona_id" text NOT NULL,
	"persona_version" integer DEFAULT 1 NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"mode" "drill_mode" NOT NULL,
	"seed" text NOT NULL,
	"status" "drill_status" DEFAULT 'live' NOT NULL,
	"end_reason" "end_reason",
	"state" jsonb NOT NULL,
	"wallet" jsonb NOT NULL,
	"elevenlabs_conversation_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"score" smallint,
	"outcome" "outcome",
	"score_detail" jsonb,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"facilitator_id" text NOT NULL,
	"join_code" text NOT NULL,
	"drill_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_sessions_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "group_votes" (
	"session_id" text NOT NULL,
	"participant_key" text NOT NULL,
	"k" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_votes_session_id_participant_key_pk" PRIMARY KEY("session_id","participant_key")
);
--> statement-breakpoint
CREATE TABLE "item_difficulty" (
	"persona_id" text NOT NULL,
	"tactic" text NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"d" real NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "item_difficulty_persona_id_tactic_difficulty_pk" PRIMARY KEY("persona_id","tactic","difficulty")
);
--> statement-breakpoint
CREATE TABLE "move_labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"turn_id" integer NOT NULL,
	"labeled_by" text NOT NULL,
	"move" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_call_consents" (
	"user_id" text PRIMARY KEY NOT NULL,
	"phone_e164_encrypted" text NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"consent_text_version" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"days_of_week" smallint[] NOT NULL,
	"window_start_minute" smallint NOT NULL,
	"window_end_minute" smallint NOT NULL,
	"timezone" text NOT NULL,
	"max_per_week" smallint DEFAULT 1 NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "practice_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"drill_id" text,
	"scheduled_for" timestamp with time zone NOT NULL,
	"placed_at" timestamp with time zone,
	"elevenlabs_conversation_id" text,
	"twilio_call_sid" text,
	"status" text DEFAULT 'scheduled' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"text_scale" real DEFAULT 1 NOT NULL,
	"speech_rate" real DEFAULT 1 NOT NULL,
	"high_contrast" boolean DEFAULT false NOT NULL,
	"prefers_text" boolean DEFAULT false NOT NULL,
	"safe_word_set" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"user_id" text NOT NULL,
	"tactic" text NOT NULL,
	"theta" real DEFAULT 1000 NOT NULL,
	"box" smallint DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_persona_id" text,
	"exposures" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_user_id_tactic_pk" PRIMARY KEY("user_id","tactic")
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"instrument" text NOT NULL,
	"phase" text NOT NULL,
	"answers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"turn_id" integer NOT NULL,
	"user_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turns" (
	"id" serial PRIMARY KEY NOT NULL,
	"drill_id" text NOT NULL,
	"seq" integer NOT NULL,
	"speaker" "speaker" NOT NULL,
	"k" integer NOT NULL,
	"stage" text,
	"tactics" text[] DEFAULT '{}'::text[] NOT NULL,
	"move" text,
	"confidence" real,
	"decided_by" text,
	"source" text,
	"text" text NOT NULL,
	"t_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_trainee_id_user_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_completed_drill_id_drills_id_fk" FOREIGN KEY ("completed_drill_id") REFERENCES "public"."drills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_invites" ADD CONSTRAINT "circle_invites_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_facilitator_id_user_id_fk" FOREIGN KEY ("facilitator_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_votes" ADD CONSTRAINT "group_votes_session_id_group_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."group_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_labels" ADD CONSTRAINT "move_labels_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_labels" ADD CONSTRAINT "move_labels_labeled_by_user_id_fk" FOREIGN KEY ("labeled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_call_consents" ADD CONSTRAINT "practice_call_consents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_calls" ADD CONSTRAINT "practice_calls_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_calls" ADD CONSTRAINT "practice_calls_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_flags" ADD CONSTRAINT "tag_flags_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_flags" ADD CONSTRAINT "tag_flags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drills_user_started_idx" ON "drills" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "drills_conversation_idx" ON "drills" USING btree ("elevenlabs_conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "turns_drill_seq_idx" ON "turns" USING btree ("drill_id","seq");