"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { assignDrill, createCircle, inviteToCircle, setShareTranscripts } from "../../../app/actions/circle";
import { Button } from "@/components/ui/button";

type Scenario = { id: string; title: string };

export function CreateCircleForm() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const result = await createCircle({ name }).catch(() => ({ ok: false as const, error: "The circle could not be saved. Check your connection and try again." }));
    setPending(false);
    if (!result.ok) return setMessage(result.error);
    setName("");
    setMessage("Your Family Circle is ready.");
    router.refresh();
  }

  return (
    <form className="circle-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor="circle-name">Circle name</label>
      <input id="circle-name" value={name} onChange={(event) => setName(event.currentTarget.value)} minLength={2} maxLength={80} required />
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create a Family Circle"}</Button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

export function InviteForm({ circleId }: { circleId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"coach" | "trainee">("trainee");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const result = await inviteToCircle({ circleId, email, role }).catch(() => ({ ok: false as const, error: "The invitation could not be sent. Check your connection and try again." }));
    setPending(false);
    if (!result.ok) return setMessage(result.error);
    setEmail("");
    setMessage("Invitation sent. It expires in seven days.");
    router.refresh();
  }

  return (
    <form className="circle-form circle-invite-form" onSubmit={(event) => void submit(event)}>
      <h3>Invite someone</h3>
      <label htmlFor={`invite-email-${circleId}`}>Email address</label>
      <input id={`invite-email-${circleId}`} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} maxLength={254} required />
      <label htmlFor={`invite-role-${circleId}`}>Their role</label>
      <select id={`invite-role-${circleId}`} value={role} onChange={(event) => setRole(event.currentTarget.value as "coach" | "trainee")}>
        <option value="trainee">Trainee</option>
        <option value="coach">Coach</option>
      </select>
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send invitation"}</Button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

export function AssignDrillForm({ circleId, traineeId, scenarios }: { circleId: string; traineeId: string; scenarios: Scenario[] }) {
  const [personaId, setPersonaId] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const result = await assignDrill({
      circleId,
      traineeId,
      ...(personaId ? { personaId } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(dueDate ? { dueAt: new Date(`${dueDate}T12:00:00`).toISOString() } : {}),
    }).catch(() => ({ ok: false as const, error: "The assignment could not be saved. Check your connection and try again." }));
    setPending(false);
    if (!result.ok) return setMessage(result.error);
    setPersonaId("");
    setDifficulty("");
    setDueDate("");
    setMessage("Practice call assigned.");
    router.refresh();
  }

  return (
    <form className="circle-form circle-assignment-form" onSubmit={(event) => void submit(event)}>
      <h4>Assign a practice call</h4>
      <label htmlFor={`assign-scenario-${traineeId}`}>Call scenario</label>
      <select id={`assign-scenario-${traineeId}`} value={personaId} onChange={(event) => setPersonaId(event.currentTarget.value)}>
        <option value="">Let the practice plan choose</option>
        {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.title}</option>)}
      </select>
      <label htmlFor={`assign-difficulty-${traineeId}`}>Difficulty</label>
      <select id={`assign-difficulty-${traineeId}`} value={difficulty} onChange={(event) => setDifficulty(event.currentTarget.value)}>
        <option value="">Use the practice plan</option>
        <option value="easy">Easy</option>
        <option value="realistic">Realistic</option>
        <option value="relentless">Relentless</option>
      </select>
      <label htmlFor={`assign-due-${traineeId}`}>Due date (optional)</label>
      <input id={`assign-due-${traineeId}`} type="date" value={dueDate} onChange={(event) => setDueDate(event.currentTarget.value)} />
      <Button type="submit" disabled={pending}>{pending ? "Assigning…" : "Assign call"}</Button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

export function TranscriptSharingControl({ circleId, initialShare }: { circleId: string; initialShare: boolean }) {
  const [share, setShare] = useState(initialShare);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function change(next: boolean) {
    setPending(true);
    setMessage("");
    const result = await setShareTranscripts({ circleId, share: next }).catch(() => ({ ok: false as const, error: "The sharing setting could not be saved. Please try again." }));
    setPending(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setShare(next);
    setMessage(next ? "Transcript sharing is on for this circle." : "Transcript sharing is off for this circle.");
    router.refresh();
  }

  return (
    <div className="sharing-control">
      <label>
        <input type="checkbox" checked={share} disabled={pending} onChange={(event) => void change(event.currentTarget.checked)} />
        <span>Share my transcripts with coaches in this circle</span>
      </label>
      <p>Coaches can already see your scores. Transcripts stay private unless you turn this on.</p>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
