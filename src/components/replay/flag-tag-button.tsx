"use client";

import { useState } from "react";
import { flagTag } from "../../../app/actions/drills";

export function FlagTagButton({ turnId }: { turnId: number }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const submit = async () => {
    if (state !== "idle") return;
    setState("saving");
    try {
      const result = await flagTag({ turnId });
      setState(result.ok ? "saved" : "error");
    } catch {
      setState("error");
    }
  };

  return (
    <span className="replay-flag-control">
      {state === "saved" ? (
        <span role="status">Thanks. Your feedback was saved.</span>
      ) : state === "error" ? (
        <span role="status">We could not save that feedback. Try again later.</span>
      ) : (
        <button className="text-link-button" type="button" onClick={() => void submit()} disabled={state === "saving"}>
          {state === "saving" ? "Saving feedback…" : "This tag looks wrong"}
        </button>
      )}
    </span>
  );
}
