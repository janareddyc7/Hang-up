CREATE TABLE "pilot_assessments" (
	"user_id" text NOT NULL,
	"phase" text NOT NULL,
	"answers" jsonb NOT NULL,
	"survey_total" real NOT NULL,
	"drill_id" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pilot_assessments_user_id_phase_pk" PRIMARY KEY("user_id","phase")
);
--> statement-breakpoint
CREATE TABLE "pilot_participants" (
	"user_id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"holdout_persona_id" text NOT NULL,
	"consent_version" text NOT NULL,
	"consent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "pilot_participants_participant_id_unique" UNIQUE("participant_id")
);
--> statement-breakpoint
ALTER TABLE "drills" ADD COLUMN "is_assessment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pilot_assessments" ADD CONSTRAINT "pilot_assessments_user_id_pilot_participants_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pilot_participants"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_assessments" ADD CONSTRAINT "pilot_assessments_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_participants" ADD CONSTRAINT "pilot_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;