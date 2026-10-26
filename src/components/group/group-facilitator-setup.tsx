"use client";

import { useState } from "react";
import Link from "next/link";
import { createGroupSession } from "../../../app/actions/groups";
import { Button } from "@/components/ui/button";

type ScenarioOption = { id: string; title: string };

export function GroupFacilitatorSetup({ scenarios }: { scenarios: ScenarioOption[] }) {
  const [personaId, setPersonaId] = useState(scenarios[0]?.id ?? "");
  const [difficulty, setDifficulty] = useState<"easy" | "realistic">("realistic");
  const [room, setRoom] = useState<{ sessionId: string; joinCode: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await createGroupSession({ personaId, difficulty });
      if (!result.ok) setError(result.error);
      else setRoom({ sessionId: result.sessionId, joinCode: result.joinCode });
    } catch {
      setError("The room could not be created. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="group-setup-panel" aria-labelledby="group-setup-title">
      <h2 id="group-setup-title">Set up a practice room</h2>
      <form className="settings-form" onSubmit={(event) => void createRoom(event)}>
        <label htmlFor="group-scenario">Caller scenario</label>
        <select id="group-scenario" value={personaId} onChange={(event) => setPersonaId(event.currentTarget.value)}>
          {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.title}</option>)}
        </select>
        <label htmlFor="group-difficulty">Call pressure</label>
        <select id="group-difficulty" value={difficulty} onChange={(event) => setDifficulty(event.currentTarget.value as "easy" | "realistic")}>
          <option value="easy">Gentle practice</option>
          <option value="realistic">Realistic practice</option>
        </select>
        <Button type="submit" size="lg" disabled={busy || !personaId}>{busy ? "Creating room…" : "Create room"}</Button>
        {error && <p role="alert">{error}</p>}
      </form>
      {room && (
        <div className="group-room-ready" aria-live="polite">
          <p className="eyebrow">Room code</p>
          <p className="group-join-code" aria-label={`Room code ${room.joinCode}`}>{room.joinCode}</p>
          <p>Ask everyone to open <strong>/group/{room.joinCode}</strong> on their phone.</p>
          <div className="group-room-actions">
            <Button asChild size="lg"><Link href={`/call/${personaId}?mode=group&difficulty=${difficulty}&text=1&offline=1&groupSessionId=${encodeURIComponent(room.sessionId)}`}>Start projected text call</Link></Button>
            <Button asChild variant="outline" size="lg"><Link href={`/call/${personaId}?mode=group&difficulty=${difficulty}&groupSessionId=${encodeURIComponent(room.sessionId)}`}>Start voice call</Link></Button>
          </div>
          <p className="group-note">Text mode avoids ElevenLabs voice minutes. Voice mode uses your configured agent.</p>
        </div>
      )}
    </section>
  );
}
