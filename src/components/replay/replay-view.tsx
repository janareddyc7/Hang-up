import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TacticChip } from "@/components/tactic-chip";
import { PONR_THRESHOLD, TACTIC_INFO, type Tactic } from "@/lib/engine/taxonomy";
import type { DrillRecord } from "@/lib/drill/runtime";
import type { ScoreResult } from "@/lib/engine/scoring";
import { selectOutcomeCopy, type ReplayEndReason } from "@/lib/replay/presentation";
import { FlagTagButton } from "./flag-tag-button";
import { PrintCardButton } from "./print-card-button";

export function ReplayView({
  record,
  score,
  callerName,
  access,
  turnIds,
  canFlag,
  groupVotes = [],
}: {
  record: DrillRecord;
  score: ScoreResult;
  callerName: string;
  access: "owner" | "judge" | "coach_shared";
  turnIds: number[];
  canFlag: boolean;
  groupVotes?: Array<{ k: number; count: number }>;
}) {
  const practiceMode = record.userId === null ? "judge" : "sparring";
  const offlineQuery = record.userId === null ? "&offline=1" : "";
  const practiceHref = `/call/${record.personaId}?mode=${practiceMode}&difficulty=${record.difficulty}${offlineQuery}`;

  return (
    <main id="main-content" className="replay-main" aria-labelledby="replay-title">
      <div className="replay-topbar">
        <Button asChild variant="link" className="replay-back">
          <Link href="/"><ArrowLeft aria-hidden="true" /> Back to calls</Link>
        </Button>
        <p className="replay-scenario">Practice replay · {callerName}</p>
      </div>
      <header className="replay-page-heading">
        <p className="eyebrow">Practice replay</p>
        <h1 id="replay-title">The conversation</h1>
        <p>Review the caller&apos;s tactics, the pressure point, and one habit for next time.</p>
      </header>

      <div className="replay-layout">
        <aside className="replay-summary" aria-label="Practice results">
          <ScoreSummary score={score} endReason={record.endReason as ReplayEndReason | undefined} />
          <section className="replay-habit" aria-labelledby="habit-title">
            <p className="eyebrow">For next time</p>
            <h2 id="habit-title">One habit to keep</h2>
            <p>{score.habit}</p>
          </section>
          <div className="replay-actions">
            <Button asChild size="lg"><Link href={practiceHref}>Practice this again</Link></Button>
            <PrintCardButton />
          </div>
          <p className="replay-privacy">This is practice, not a judgment. Your transcript is shown only to you and people you have chosen to share it with.</p>
        </aside>

        <section className="replay-content" aria-label="Practice transcript">
          {access === "coach_shared" && <p className="replay-sharing-note">The trainee chose to share this transcript with you.</p>}
          <header className="replay-transcript-heading">
            <p className="eyebrow">What happened</p>
            <h2 id="transcript-title">Caller tactics, turn by turn</h2>
            <p>Each caller line is labeled as it happened. {score.pointOfNoReturnK === null ? "Pressure stayed below the hang-up point in this practice." : "The yellow marker shows where it was time to hang up."}</p>
          </header>

          <PressureLine pressure={score.pressure} groupVotes={groupVotes} />
          {groupVotes.length > 0 && <p className="group-replay-caption">Room votes are shown in the blue bars beside the pressure line. Each person votes once.</p>}

          <ol className="replay-transcript" aria-label="Conversation in order">
            {record.turns.map((turn, index) => {
              const isCaller = turn.speaker === "scammer";
              const atPonr = isCaller && turn.k === score.pointOfNoReturnK;
              const pressure = isCaller ? score.pressure.find((point) => point.k === turn.k) : undefined;
              return (
                <li className={`replay-turn ${isCaller ? "replay-turn--caller" : "replay-turn--you"}`} key={`${turn.speaker}-${index}`}>
                  <span className="replay-turn-speaker">{isCaller ? callerName : "You"}</span>
                  <p className="replay-turn-text">{turn.text}</p>
                  {isCaller && turn.tactics.length > 0 && (
                    <div className="replay-tactics" aria-label="Caller tactics">
                      {turn.tactics.map((tactic) => (
                        <TacticExplanation
                          key={tactic}
                          tactic={tactic}
                          turnId={turnIds[index]}
                          canFlag={canFlag}
                        />
                      ))}
                    </div>
                  )}
                  {pressure && <p className="replay-pressure-caption">Pressure level: {pressureLabel(pressure.r)}</p>}
                  {atPonr && <PonrRule />}
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <section className="replay-print-card" aria-hidden="true">
        <h1>Before you send money or share a code, hang up and call:</h1>
        <p>My bank: ________________________________________</p>
        <p>Someone I trust: _________________________________</p>
        <p>Our family safe word: _____________________________</p>
        <p>If a caller creates pressure, pause and call back using a number you already trust.</p>
      </section>
    </main>
  );
}

export function ScoreSummary({ score, endReason, summaryOnly = false }: { score: ScoreResult; endReason?: ReplayEndReason; summaryOnly?: boolean }) {
  const copy = summaryOnly
    ? { title: outcomeLabel(score.outcome), message: "This summary shows the score and outcome only." }
    : selectOutcomeCopy(score.outcome, score.turnsPastPointOfNoReturn, endReason);
  const Icon = score.outcome === "clean_exit" ? CheckCircle2 : CircleAlert;
  const pointSummary = score.pointOfNoReturnK === null
    ? "The pressure did not reach the hang-up point."
    : score.turnsPastPointOfNoReturn === 0
      ? "You ended the call at the red flag."
      : `You stayed ${score.turnsPastPointOfNoReturn} ${score.turnsPastPointOfNoReturn === 1 ? "turn" : "turns"} after the red flag.`;

  return (
    <section className={`replay-score replay-score--${score.outcome}`} aria-labelledby="score-title">
      <p className="eyebrow">Your result</p>
      <div className="replay-score-number"><span>{score.score}</span><span className="replay-score-out-of">/ 100</span></div>
      <p className="replay-score-caption">Practice score</p>
      <div className="replay-outcome">
        <Icon aria-hidden="true" />
        <h2 id="score-title">{copy.title}</h2>
      </div>
      <p className="replay-outcome-copy">{copy.message}</p>
      {!summaryOnly && <p className="replay-ponr-summary">{pointSummary}</p>}
      {!summaryOnly && score.msPastPointOfNoReturn !== null && score.msPastPointOfNoReturn > 0 && (
        <p className="replay-time-summary">That was about {formatDuration(score.msPastPointOfNoReturn)} later.</p>
      )}
    </section>
  );
}

function outcomeLabel(outcome: ScoreResult["outcome"]): string {
  return outcome === "clean_exit" ? "Clean exit" : outcome === "skeptical" ? "Stayed on after a red flag" : "A risky request got through";
}

function PressureLine({ pressure, groupVotes }: { pressure: ScoreResult["pressure"]; groupVotes: Array<{ k: number; count: number }> }) {
  if (pressure.length === 0) {
    return <p className="replay-pressure-empty">No caller pressure tactics were recorded in this practice.</p>;
  }
  const max = Math.max(5, pressure.at(-1)?.r ?? 0);
  const height = Math.max(140, pressure.length * 42);
  const points = pressure.map((point, index) => {
    const x = 12 + Math.min(1, point.r / max) * 76;
    const y = 18 + index * ((height - 36) / Math.max(1, pressure.length - 1));
    return `${x},${y}`;
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point}`).join(" ");
  const maxVotes = Math.max(1, ...groupVotes.map((vote) => vote.count));

  return (
    <figure className="replay-pressure-figure">
      <svg className="replay-pressure-svg" viewBox={`0 0 100 ${height}`} role="img" aria-labelledby="pressure-title pressure-description">
        <title id="pressure-title">Pressure across the caller&apos;s turns</title>
        <desc id="pressure-description">The pressure rises from {pressure[0]?.r ?? 0} to {pressure.at(-1)?.r ?? 0}. The yellow line in the transcript marks where it was time to hang up. {groupVotes.length > 0 ? `Blue bars show room votes by caller turn: ${groupVotes.map((vote) => `turn ${vote.k}, ${vote.count} votes`).join("; ")}.` : ""}</desc>
        <defs>
          <linearGradient id="pressure-gradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--pressure-low)" />
            <stop offset="100%" stopColor="var(--pressure-high)" />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke="url(#pressure-gradient)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        {groupVotes.map((vote) => {
          const index = pressure.findIndex((point) => point.k === vote.k);
          if (index < 0) return null;
          const y = 18 + index * ((height - 36) / Math.max(1, pressure.length - 1));
          return <rect key={`group-${vote.k}`} x="0" y={y - 3} width={9 * vote.count / maxVotes} height="6" rx="3" fill="var(--accent)" />;
        })}
        {pressure.map((point, index) => {
          const x = 12 + Math.min(1, point.r / max) * 76;
          const y = 18 + index * ((height - 36) / Math.max(1, pressure.length - 1));
          return <circle key={point.k} cx={x} cy={y} r="4" fill={point.brightLine ? "var(--signal)" : "var(--pressure-high)"} />;
        })}
      </svg>
      <figcaption>Pressure builds as callers add tactics. It is a training guide, not a measure of you.</figcaption>
    </figure>
  );
}

function PonrRule() {
  return (
    <div className="ponr-rule" role="note">
      <span aria-hidden="true" />
      <strong>This is where to hang up</strong>
      <span aria-hidden="true" />
    </div>
  );
}

function TacticExplanation({ tactic, turnId, canFlag }: { tactic: Tactic; turnId: number | undefined; canFlag: boolean }) {
  const info = TACTIC_INFO[tactic];
  return (
    <details className="replay-tactic-details">
      <summary aria-label={`Explain tactic: ${info.label}`}><TacticChip tactic={tactic} /></summary>
      <div className="replay-tactic-explanation">
        <p>{info.explain}</p>
        {canFlag && turnId ? <FlagTagButton turnId={turnId} /> : <p className="replay-feedback-note">Sign in to send private feedback about this tag.</p>}
      </div>
    </details>
  );
}

function pressureLabel(value: number): string {
  const ratio = value / PONR_THRESHOLD;
  return ratio < 0.4 ? "low" : ratio < 1 ? "rising" : "high";
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(1, Math.round(milliseconds / 1000));
  return seconds < 60 ? `${seconds} ${seconds === 1 ? "second" : "seconds"}` : `${Math.round(seconds / 60)} minutes`;
}

