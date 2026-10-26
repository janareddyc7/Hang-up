import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { drills, pilotAssessments, pilotParticipants } from "@/db/schema";
import { env } from "@/env";
import { getSession } from "@/lib/auth/session";
import { pilotConfig } from "@/lib/pilot/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!pilotConfig()) return new Response("Not found", { status: 404 });
  const session = await getSession();
  if (!session || !env.ADMIN_EMAILS.includes(session.user.email.toLowerCase())) return new Response("Forbidden", { status: 403 });
  const rows = await db.select({ participant: pilotParticipants.participantId, phase: pilotAssessments.phase, surveyTotal: pilotAssessments.surveyTotal, outcome: drills.outcome, score: drills.score })
    .from(pilotParticipants).innerJoin(pilotAssessments, eq(pilotAssessments.userId, pilotParticipants.userId))
    .leftJoin(drills, and(eq(drills.id, pilotAssessments.drillId), eq(drills.isAssessment, true)))
    .where(isNull(pilotParticipants.withdrawnAt)).orderBy(pilotParticipants.participantId, pilotAssessments.submittedAt);
  // Export contains random participant identifiers, not account IDs, email, timestamps, answers, or transcripts.
  const csv = ["participant_id,phase,survey_total,outcome,score", ...rows.map((row) => [row.participant, row.phase, row.surveyTotal, row.outcome ?? "", row.score ?? ""].map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))].join("\r\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="hang-up-pilot.csv"', "cache-control": "private, no-store" } });
}
