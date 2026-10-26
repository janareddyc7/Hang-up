"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enrollPilot, submitPilotSurvey, withdrawPilot } from "../../../app/actions/pilot";
import { Button } from "@/components/ui/button";
import type { PilotConfig, PilotPhase } from "@/lib/pilot/protocol";

export function PilotConsent({ version }: { version: string }) {
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  return <form className="settings-form" onSubmit={async (event) => {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      const result = await enrollPilot({ consent, consentVersion: version });
      if (!result.ok) setMessage(result.error); else router.refresh();
    } catch { setMessage("Enrollment could not be saved. Please try again."); }
    finally { setPending(false); }
  }}>
    <label className="settings-check"><input type="checkbox" checked={consent} required onChange={(event) => setConsent(event.currentTarget.checked)} /> I have read the information above and freely agree to take part.</label>
    <Button disabled={pending || !consent}>{pending ? "Saving consent…" : "Join the pilot"}</Button>
    {message && <p role="status">{message}</p>}
  </form>;
}

export function PilotSurvey({ config, phase }: { config: PilotConfig; phase: PilotPhase }) {
  const [answers, setAnswers] = useState<Array<number | undefined>>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  return <form className="settings-form" onSubmit={async (event) => {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      const result = await submitPilotSurvey({ phase, answers });
      if (!result.ok) setMessage(result.error); else router.refresh();
    } catch { setMessage("Your answers could not be saved. Please try again."); }
    finally { setPending(false); }
  }}>
    <p>{config.minimum}: {config.lowLabel} · {config.maximum}: {config.highLabel}</p>
    {config.items.map((item, index) => <label key={item.id} htmlFor={`pilot-${phase}-${item.id}`}>{item.text}
      <select id={`pilot-${phase}-${item.id}`} required disabled={pending} value={answers[index] ?? ""} onChange={(event) => {
        const answer = event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value);
        setAnswers((current) => Array.from({ length: 5 }, (_, i) => i === index ? answer : current[i]));
      }}>
        <option value="">Choose an answer</option>
        {Array.from({ length: config.maximum - config.minimum + 1 }, (_, i) => config.minimum + i).map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>)}
    <Button disabled={pending}>{pending ? "Saving answers…" : "Save answers"}</Button>
    {message && <p role="status">{message}</p>}
  </form>;
}

export function WithdrawPilot() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  return <div><Button variant="outline" disabled={pending} onClick={async () => {
    setPending(true); setMessage("");
    try { const result = await withdrawPilot(); if (!result.ok) setMessage(result.error); else router.refresh(); }
    catch { setMessage("The request could not be saved. Please try again."); }
    finally { setPending(false); }
  }}>{pending ? "Removing pilot responses…" : "Leave pilot and delete my pilot responses"}</Button>{message && <p role="status">{message}</p>}</div>;
}
