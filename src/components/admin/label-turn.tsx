"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitHumanLabel } from "../../../app/actions/labels";
import { USER_MOVES, type UserMove } from "@/lib/engine/taxonomy";
import { Button } from "@/components/ui/button";

const labels: Record<UserMove, string> = {
  hang_up: "Hang up",
  refuse: "Refuse",
  verify_independent: "Verify independently",
  ask_safe_word: "Ask for a safe word",
  delay_consult: "Delay or consult someone",
  ask_identity: "Ask who is calling",
  question: "Ask a question",
  comply_minor: "Go along without sharing details",
  disclose: "Disclose personal information",
  share_code: "Share a one-time code",
  agree_payment: "Agree to pay",
  agree_move_money: "Agree to move money",
  agree_remote_access: "Agree to remote access",
  agree_secrecy: "Agree to keep it secret",
  unclear: "Unclear",
};

export type LabelSample = { turnId: number; callerLine: string; userText: string };

export function LabelTurn({ sample }: { sample: LabelSample }) {
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const router = useRouter();

  async function label(move: UserMove) {
    setPending(true);
    setStatus("");
    const result = await submitHumanLabel({ turnId: sample.turnId, move, ...(notes.trim() ? { notes } : {}) }).catch(() => ({ ok: false as const, error: "The label could not be saved. Check your connection and try again." }));
    setPending(false);
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    setStatus("Human label saved.");
    router.refresh();
  }

  return (
    <article className="label-sample">
      <p className="eyebrow">Caller line</p>
      <blockquote>{sample.callerLine || "(No caller line recorded before this reply.)"}</blockquote>
      <p className="eyebrow">Trainee reply</p>
      <blockquote>{sample.userText}</blockquote>
      <label htmlFor={`label-notes-${sample.turnId}`}>Review note (optional)</label>
      <textarea id={`label-notes-${sample.turnId}`} value={notes} maxLength={1000} onChange={(event) => setNotes(event.currentTarget.value)} />
      <p>Choose the best description of the trainee’s reply.</p>
      <div className="move-label-grid" role="group" aria-label="Human move label">
        {USER_MOVES.map((move) => <Button key={move} type="button" variant="outline" disabled={pending} onClick={() => void label(move)}>{labels[move]}</Button>)}
      </div>
      {status && <p role="status">{status}</p>}
    </article>
  );
}
