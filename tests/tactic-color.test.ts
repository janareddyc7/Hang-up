import { describe, expect, it } from "vitest";
import { TACTICS, TACTIC_INFO } from "@/lib/engine/taxonomy";
import { TACTIC_COLOR_TOKEN } from "@/lib/tactic-color";

describe("tactic color tokens", () => {
  it("provides a theme token for every engine tactic", () => {
    expect(Object.keys(TACTIC_COLOR_TOKEN).sort()).toEqual([...TACTICS].sort());
    expect(Object.values(TACTIC_COLOR_TOKEN).every((token) => token.startsWith("--"))).toBe(true);
  });

  it("uses the signal color for every bright-line tactic", () => {
    const brightLineTactics = TACTICS.filter((tactic) => TACTIC_INFO[tactic].brightLine);
    for (const tactic of brightLineTactics) {
      expect(TACTIC_COLOR_TOKEN[tactic]).toBe("--signal");
    }
  });
});
