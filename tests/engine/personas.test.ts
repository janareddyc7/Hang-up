import { describe, expect, it } from "vitest";
import { BANNED_ORG_PATTERNS, validateLine } from "../../src/lib/engine/actor";
import { STAGES } from "../../src/lib/engine/schema";
import { personas } from "../helpers";

describe("persona cards", () => {
  it("loads all six launch personas", () => {
    expect([...personas.keys()].sort()).toEqual([
      "bank-fraud-department",
      "benefits-suspension",
      "gov-consumer-safety",
      "grandchild-emergency",
      "prize-sweepstakes",
      "tech-support",
    ]);
  });

  for (const p of personas.values()) {
    describe(p.id, () => {
      it("uses only fictional organization names", () => {
        for (const re of BANNED_ORG_PATTERNS) {
          expect(re.test(p.organization), `${p.organization} matches ${re}`).toBe(false);
        }
      });

      it("has fallback lines that pass the same validator as model lines", () => {
        const lines = [
          p.firstMessage,
          p.givesUpLine,
          p.convertedLine,
          ...STAGES.flatMap((s) => p.stages[s].fallbackLines),
          ...p.counterObjections.flatMap((c) => c.lines),
        ];
        for (const line of lines) {
          const check = validateLine(line);
          expect(check.problems, line).toEqual([]);
        }
      });

      it("can answer the core resistance moves", () => {
        const triggers = new Set(p.counterObjections.map((c) => c.trigger));
        expect(triggers.has("refuse")).toBe(true);
        expect(triggers.has("verify_independent")).toBe(true);
        expect(triggers.has("ask_identity")).toBe(true);
      });

      it("reaches at least one bright-line tactic", () => {
        const bright = ["secrecy", "move_money", "unusual_payment", "credential_request", "remote_access"];
        const all = STAGES.flatMap((s) => p.stages[s].allowedTactics);
        expect(all.some((t) => bright.includes(t))).toBe(true);
      });
    });
  }

  it("family emergency persona answers the safe-word question", () => {
    const p = personas.get("grandchild-emergency")!;
    expect(p.counterObjections.some((c) => c.trigger === "ask_safe_word")).toBe(true);
  });
});
