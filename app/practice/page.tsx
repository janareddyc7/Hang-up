import Link from "next/link";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { ArrowRight, ClipboardCheck, History, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/db/client";
import { assignments, circles, drills, itemDifficulty as itemDifficultyTable, skills } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getRuntimeDeps } from "@/lib/drill/deps";
import { TacticSchema } from "@/lib/engine/schema";
import { recommendPractice } from "@/lib/practice/recommend";
import { pilotHoldout } from "@/lib/pilot/server";
import { env } from "@/env";

function shortDate(value: Date | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(value);
}

export default async function PracticePage() {
  const trainee = await requireUser();
  const clockPromise = db.execute<{ nowMs: number | string }>(
    sql`select floor(extract(epoch from clock_timestamp()) * 1000) as "nowMs"`,
  ).then(({ rows }) => Number(rows[0]?.nowMs ?? 0));
  const [openAssignments, history, skillRows, completedRows, items, nowMs, holdout] = await Promise.all([
    db.select({ id: assignments.id, circleId: assignments.circleId, circleName: circles.name, personaId: assignments.personaId, difficulty: assignments.difficulty, dueAt: assignments.dueAt, createdAt: assignments.createdAt })
      .from(assignments)
      .innerJoin(circles, eq(circles.id, assignments.circleId))
      .where(and(eq(assignments.traineeId, trainee.id), isNull(assignments.completedDrillId)))
      .orderBy(asc(assignments.dueAt), asc(assignments.createdAt)),
    db.select({ id: drills.id, personaId: drills.personaId, difficulty: drills.difficulty, score: drills.score, outcome: drills.outcome, startedAt: drills.startedAt })
      .from(drills)
      .where(and(eq(drills.userId, trainee.id), eq(drills.status, "ended")))
      .orderBy(desc(drills.startedAt))
      .limit(30),
    db.select().from(skills).where(eq(skills.userId, trainee.id)),
    db.select({ id: drills.id }).from(drills).where(and(eq(drills.userId, trainee.id), eq(drills.status, "ended"), eq(drills.isAssessment, false))),
    db.select().from(itemDifficultyTable),
    clockPromise,
    pilotHoldout(trainee.id),
  ]);
  const deps = getRuntimeDeps();
  const allPersonas = [...deps.personas.values()];
  const skillList = skillRows.flatMap((row) => {
    const tactic = TacticSchema.safeParse(row.tactic);
    return tactic.success ? [{ tactic: tactic.data, theta: row.theta, box: row.box, dueAtMs: row.dueAt.getTime(), ...(row.lastPersonaId ? { lastPersonaId: row.lastPersonaId } : {}) }] : [];
  });
  const itemMap = new Map(items.map((row) => [`${row.personaId}:${row.tactic}:${row.difficulty}`, row.d] as const));
  const recommendation = recommendPractice({
    completedDrills: completedRows.length,
    personas: allPersonas,
    skills: skillList,
    nowMs,
    excludedPersonaIds: holdout ? new Set([holdout]) : undefined,
    itemDifficulty: (personaId, tactic, difficulty) => itemMap.get(`${personaId}:${tactic}:${difficulty}`) ?? ({ easy: 900, realistic: 1000, relentless: 1150 } as const)[difficulty],
  });
  const recommendedPersona = recommendation ? deps.personas.get(recommendation.personaId) : undefined;

  return (
    <main id="main-content" className="practice-main">
      <header className="practice-intro">
        <p className="eyebrow">Your practice plan</p>
        <h1>Build the habit one call at a time.</h1>
        <p>Your progress is private to you and the coaches you choose. Every call is a fictional practice conversation.</p>
        <Button asChild variant="outline"><Link href="/facilitate">Run a group practice</Link></Button>
      </header>
      {env.PILOT_ENABLED && <section className="practice-panel"><h2>Pilot check-in</h2><p>Check your before-practice, after-practice, or follow-up assessment. Your held-out caller is excluded from your practice plan.</p><Button asChild variant="outline"><Link href="/pilot">Open pilot check-in</Link></Button></section>}

      {openAssignments.length > 0 && (
        <section className="practice-panel practice-assignments" aria-labelledby="assignments-title">
          <div className="practice-section-heading"><ClipboardCheck aria-hidden="true" /><div><p className="eyebrow">From your coach</p><h2 id="assignments-title">Calls to practice</h2></div></div>
          <ul className="practice-assignment-list">
            {openAssignments.map((assignment) => {
              const assignedPersona = assignment.personaId ? deps.personas.get(assignment.personaId) : recommendedPersona;
              const fallbackPersona = assignedPersona ?? allPersonas[0];
              if (!fallbackPersona) return null;
              const difficulty = assignment.difficulty ?? recommendation?.difficulty ?? "realistic";
              const link = `/call/${encodeURIComponent(fallbackPersona.id)}?mode=assigned&assignmentId=${encodeURIComponent(assignment.id)}&difficulty=${difficulty}`;
              return (
                <li className="practice-assignment" key={assignment.id}>
                  <div><p className="practice-assignment-meta">{assignment.circleName} · Due {shortDate(assignment.dueAt)}</p><h3>{assignedPersona?.title ?? "Recommended practice call"}</h3><p>{difficulty[0]?.toUpperCase()}{difficulty.slice(1)} practice</p></div>
                  <Button asChild><Link href={link}>Start call <ArrowRight aria-hidden="true" /></Link></Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="practice-panel practice-recommendation" aria-labelledby="next-practice-title">
        <div className="practice-section-heading"><Sparkles aria-hidden="true" /><div><p className="eyebrow">Picked for you</p><h2 id="next-practice-title">Your next practice call</h2></div></div>
        {recommendation && recommendedPersona ? (
          <article className="practice-next-card">
            <div><p className="practice-assignment-meta">{completedRows.length < 3 ? `Placement call ${completedRows.length + 1} of 3` : `Practice ${recommendation.difficulty}`}</p><h3>{recommendedPersona.title}</h3><p>Practice: {recommendation.tactic.replaceAll("_", " ")}</p></div>
            <Button asChild size="lg"><Link href={`/call/${encodeURIComponent(recommendedPersona.id)}?mode=sparring&difficulty=${recommendation.difficulty}`}>Take this practice call <ArrowRight aria-hidden="true" /></Link></Button>
          </article>
        ) : <p>No practice calls are available right now. Please check back later.</p>}
      </section>

      <section className="practice-panel practice-history" aria-labelledby="history-title">
        <div className="practice-section-heading"><History aria-hidden="true" /><div><p className="eyebrow">Your progress</p><h2 id="history-title">Recent practice</h2></div></div>
        {history.length === 0 ? <p>No practice calls yet. Your first one takes about two minutes.</p> : (
          <ol className="practice-history-list">
            {history.map((drill) => {
              const persona = deps.personas.get(drill.personaId);
              return <li key={drill.id}><div><h3>{persona?.title ?? "Practice call"}</h3><p>{drill.difficulty} · {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(drill.startedAt)}</p></div><strong>{drill.score ?? "—"}/100 · {drill.outcome ?? "Scored"}</strong><Button asChild variant="outline"><Link href={`/replay/${encodeURIComponent(drill.id)}`}>Review replay</Link></Button></li>;
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
