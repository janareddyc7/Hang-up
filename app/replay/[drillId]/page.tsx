import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { circleMembers, groupSessions, groupVotes, turns } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { getRuntimeDeps } from "@/lib/drill/deps";
import { finishDrill } from "@/lib/drill/runtime";
import { personas } from "@/lib/personas";
import { resolveReplayAccess } from "@/lib/replay/access";
import { hasJudgeSession } from "@/lib/replay/judge-session";
import { assessmentPersona } from "@/lib/pilot/costume";
import type { ReplayEndReason } from "@/lib/replay/presentation";
import { ReplayView, ScoreSummary } from "@/components/replay/replay-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ drillId: string }> };

export default async function ReplayPage({ params }: Props) {
  const { drillId } = await params;
  if (drillId.length < 8 || drillId.length > 100) notFound();

  const deps = getRuntimeDeps();
  const record = await deps.store.get(drillId);
  if (!record) notFound();

  const session = await getSession();
  let coachMemberships: { shareTranscripts: boolean }[] = [];
  if (session?.user && record.userId && session.user.id !== record.userId) {
    const traineeMembership = alias(circleMembers, "replay_trainee_membership");
    const coachMembership = alias(circleMembers, "replay_coach_membership");
    coachMemberships = await db
      .select({ shareTranscripts: traineeMembership.shareTranscripts })
      .from(traineeMembership)
      .innerJoin(coachMembership, eq(traineeMembership.circleId, coachMembership.circleId))
      .where(and(
        eq(traineeMembership.userId, record.userId),
        eq(traineeMembership.role, "trainee"),
        eq(coachMembership.userId, session.user.id),
        eq(coachMembership.role, "coach"),
      ))
      .limit(20);
  }

  const access = resolveReplayAccess({
    recordUserId: record.userId,
    mode: record.mode ?? (record.userId === null ? "judge" : "sparring"),
    viewerId: session?.user.id ?? null,
    guestSessionMatches: record.userId === null && await hasJudgeSession(record.judgeSessionHash),
    coachMemberships,
  });
  if (access === "denied") notFound();

  const score = record.status === "ended" && record.score
    ? record.score
    : await finishDrill(deps, record.id);
  const finishedRecord = await deps.store.get(record.id);
  if (!finishedRecord) notFound();
  let persona = personas.find((item) => item.id === finishedRecord.personaId);
  if (!persona) notFound();
  if (finishedRecord.isAssessment) persona = assessmentPersona(persona, finishedRecord.seed);

  if (access === "coach_scores") {
    return (
      <main id="main-content" className="replay-main replay-coach-summary" aria-labelledby="replay-title">
        <p className="eyebrow">Family Circle progress</p>
        <h1 id="replay-title">Practice score</h1>
        <p className="replay-scenario">{persona.title}</p>
        <ScoreSummary score={score} endReason={finishedRecord.endReason as ReplayEndReason | undefined} summaryOnly />
        <p className="replay-privacy">The trainee has not shared this transcript. You can see the score and outcome only.</p>
      </main>
    );
  }

  const turnRows = process.env.HANGUP_E2E_MODE === "true" && process.env.NODE_ENV !== "production"
    ? []
    : await db.select({ id: turns.id }).from(turns).where(eq(turns.drillId, finishedRecord.id)).orderBy(turns.seq);
  const rawGroupVotes = finishedRecord.mode === "group"
    ? await db.select({ k: groupVotes.k }).from(groupVotes)
      .innerJoin(groupSessions, eq(groupSessions.id, groupVotes.sessionId))
      .where(eq(groupSessions.drillId, finishedRecord.id))
    : [];
  const voteCounts = new Map<number, number>();
  for (const vote of rawGroupVotes) voteCounts.set(vote.k, (voteCounts.get(vote.k) ?? 0) + 1);
  return (
    <ReplayView
      record={finishedRecord}
      score={score}
      callerName={persona.callerName}
      access={access}
      turnIds={turnRows.map((turn) => turn.id)}
      groupVotes={[...voteCounts].map(([k, count]) => ({ k, count }))}
      canFlag={access === "owner" || (access === "judge" && Boolean(session?.user))}
    />
  );
}
