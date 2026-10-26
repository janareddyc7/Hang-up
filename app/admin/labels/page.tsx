import { alias } from "drizzle-orm/pg-core";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { env } from "@/env";
import { LabelTurn, type LabelSample } from "@/components/admin/label-turn";
import { db } from "@/db/client";
import { drills, moveLabels, turns } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { HARD_FAILS } from "@/lib/engine/taxonomy";

const HARD_FAIL_SAMPLE_SIZE = 40;
const OTHER_SAMPLE_SIZE = 160;

export default async function LabelReviewPage() {
  const reviewer = await requireUser();
  if (!env.ADMIN_EMAILS.some((email) => email.toLowerCase() === reviewer.email.toLowerCase())) notFound();

  const caller = alias(turns, "prior_caller_turn");
  const hardFails = await db.select({ turnId: turns.id, userText: turns.text, callerLine: caller.text })
    .from(turns)
    .innerJoin(drills, eq(drills.id, turns.drillId))
    .leftJoin(caller, and(eq(caller.drillId, turns.drillId), eq(caller.seq, sql`${turns.seq} - 1`), eq(caller.speaker, "scammer")))
    .leftJoin(moveLabels, eq(moveLabels.turnId, turns.id))
    .where(and(eq(turns.speaker, "user"), eq(drills.status, "ended"), isNull(moveLabels.id), eq(turns.decidedBy, "classifier"), inArray(turns.move, HARD_FAILS)))
    .orderBy(sql`random()`).limit(HARD_FAIL_SAMPLE_SIZE);
  const hardFailIds = hardFails.map((turn) => turn.turnId);
  const others = await db.select({ turnId: turns.id, userText: turns.text, callerLine: caller.text })
    .from(turns)
    .innerJoin(drills, eq(drills.id, turns.drillId))
    .leftJoin(caller, and(eq(caller.drillId, turns.drillId), eq(caller.seq, sql`${turns.seq} - 1`), eq(caller.speaker, "scammer")))
    .leftJoin(moveLabels, eq(moveLabels.turnId, turns.id))
    .where(and(
      eq(turns.speaker, "user"),
      eq(drills.status, "ended"),
      isNull(moveLabels.id),
      notInArray(turns.id, hardFailIds.length ? hardFailIds : [0]),
    ))
    .orderBy(sql`random()`)
    .limit(OTHER_SAMPLE_SIZE);

  const sample: LabelSample[] = [...hardFails, ...others].map((row) => ({ turnId: row.turnId, callerLine: row.callerLine ?? "", userText: row.userText }));
  const hasStratifiedBatch = hardFails.length >= HARD_FAIL_SAMPLE_SIZE && sample.length >= HARD_FAIL_SAMPLE_SIZE + OTHER_SAMPLE_SIZE;
  return (
    <main id="main-content" className="label-admin-main">
      <header className="label-admin-intro"><p className="eyebrow">Quality review</p><h1>Blindly label practice replies.</h1><p>The model’s label is hidden. Read the caller line and the redacted reply, then choose the closest move.</p></header>
      {!hasStratifiedBatch && <aside className="label-batch-note" role="status">This batch needs 40 classifier-labeled hard fails and 160 other turns. Current eligible sample: {hardFails.length} hard fails and {others.length} other turns. More labeled practice is needed before a complete 200-turn batch is available.</aside>}
      {sample.length === 0 ? <section className="label-empty"><h2>No replies are ready for review.</h2><p>Completed practice turns will appear here after they become eligible for the review batch.</p></section> : (
        <section className="label-sample-list" aria-label="Turns awaiting human review">
          {sample.map((row) => <LabelTurn key={row.turnId} sample={row} />)}
        </section>
      )}
    </main>
  );
}
