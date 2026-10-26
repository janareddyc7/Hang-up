ALTER TABLE "circle_invites" ADD COLUMN "email" text;--> statement-breakpoint
UPDATE "circle_invites" SET "email" = 'expired-' || "id" || '@invalid.local', "expires_at" = now() WHERE "email" IS NULL;--> statement-breakpoint
ALTER TABLE "circle_invites" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "drills" ADD COLUMN "assignment_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "circle_invites_pending_email_idx" ON "circle_invites" USING btree ("circle_id","email") WHERE "circle_invites"."accepted_at" is null;
