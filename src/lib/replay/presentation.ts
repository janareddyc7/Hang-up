import type { Outcome } from "@/lib/engine/scoring";

export type ReplayEndReason = "user_hung_up" | "scammer_gave_up" | "converted" | "turn_limit" | "error";

export interface OutcomeCopy {
  title: string;
  message: string;
}

/** Plain, non-shaming replay copy for each scored outcome. */
export function selectOutcomeCopy(outcome: Outcome, turnsPastPointOfNoReturn: number, endReason?: ReplayEndReason): OutcomeCopy {
  if (endReason === "scammer_gave_up") {
    return { title: "They gave up", message: "You held your ground. Next time, you can hang up even sooner." };
  }

  if (endReason === "error") {
    return { title: "Your practice was saved", message: "The call dropped. You can review what happened and try again when you are ready." };
  }

  if (outcome === "converted") {
    return { title: "A risky request got through", message: "This replay shows where the pressure worked and what you can do next time." };
  }

  if (outcome === "skeptical") {
    const turns = Math.max(0, turnsPastPointOfNoReturn);
    const unit = turns === 1 ? "turn" : "turns";
    return {
      title: "You stayed on after the red flag",
      message: `You stayed on ${turns} ${unit} after the red flag. You did not give anything away.`,
    };
  }

  return { title: "You hung up before they could push you", message: "That's the habit. Keep calling back on a number you already trust." };
}
