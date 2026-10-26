import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/env";
import { requireUser } from "@/lib/auth/session";
import { pilotConfig, pilotProgress } from "@/lib/pilot/server";
import { PILOT_PHASES, phaseAvailable } from "@/lib/pilot/protocol";
import { PilotConsent, PilotSurvey, WithdrawPilot } from "@/components/pilot/pilot-forms";
import { Button } from "@/components/ui/button";

export default async function PilotPage() {
  if (!env.PILOT_ENABLED) notFound();
  const user = await requireUser();
  const config = pilotConfig();
  if (!config) return <main id="main-content" className="site-main"><h1>Pilot enrollment is not open.</h1><p>The administrator must enter the five cited items and scoring in content/pilot.json, then record adult review before enrollment opens.</p><Link href="/practice">Return to practice</Link></main>;
  const progress = await pilotProgress(user.id);
  const titles = { pre: "Before practice", post: "After four weeks", retention: "Follow-up" };
  return <main id="main-content" className="practice-main">
    <header className="practice-intro"><p className="eyebrow">Optional pilot</p><h1>Help us study practice.</h1><p>This pilot measures what happens in fictional assessments. It does not establish protection from real scams.</p></header>
    {!progress ? <section className="practice-panel"><h2>Your choice</h2><p>{config.consentText}</p><p>Consent version: {config.consentVersion}</p><PilotConsent version={config.consentVersion} /></section>
      : progress.participant.withdrawnAt ? <section className="practice-panel"><h2>You have left the pilot.</h2><p>Your pilot responses have been deleted. Your ordinary practice account and history remain available.</p><Link href="/practice">Return to practice</Link></section>
      : <>
        {PILOT_PHASES.map((phase) => {
          const assessment = progress.rows.find((row) => row.phase === phase);
          const due = progress.dueAt(phase);
          const available = phaseAvailable(phase, progress.completed, due, progress.nowMs);
          return <section className="practice-panel" key={phase}><h2>{titles[phase]}</h2>
            {assessment?.outcome ? <p>Assessment complete. <Link href={`/replay/${assessment.drillId}`}>Read your replay</Link></p>
              : assessment?.drillId ? <p>This assessment has started. <Link href={`/replay/${assessment.drillId}`}>Finish and open its replay</Link></p>
              : !available ? <p>{Number.isFinite(due) ? `Available from ${new Date(due).toLocaleDateString("en-US")}, after the previous assessment is complete.` : "Available two weeks after your after-practice assessment."}</p>
              : assessment ? <><p>Your survey is saved. Use only fictional wallet details during the holdout assessment.</p><Button asChild><Link href={`/call/${encodeURIComponent(progress.participant.holdoutPersonaId)}?mode=sparring&difficulty=realistic&offline=1&pilotPhase=${phase}`}>Start holdout text call</Link></Button></>
              : <PilotSurvey config={config} phase={phase} />}
          </section>;
        })}
        <section className="practice-panel"><h2>Leave the pilot</h2><p>This deletes your study survey responses and removes you from future study exports. It keeps your personal account and practice replays.</p><WithdrawPilot /></section>
      </>}
    <p>Instrument source: <a href={config.sourceUrl} target="_blank" rel="noopener noreferrer">{config.citation}</a></p>
  </main>;
}
