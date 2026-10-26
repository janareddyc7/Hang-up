import { describe, expect, it } from "vitest";
import { personaTactics } from "../../src/lib/engine/personas";
import {
  chooseNextDrill,
  dueAt,
  expectedSuccess,
  nextBox,
  updateElo,
  type SkillRow,
} from "../../src/lib/engine/skills";
import { personas } from "../helpers";

const scenarios = [...personas.values()].map((p) => ({ personaId: p.id, tactics: personaTactics(p) }));

describe("elo", () => {
  it("expects 50% at equal ratings", () => {
    expect(expectedSuccess(1000, 1000)).toBeCloseTo(0.5);
  });

  it("moves the user up and the item down after a success, symmetric in sign", () => {
    const r = updateElo(1000, 1000, 1);
    expect(r.theta).toBeCloseTo(1016);
    expect(r.d).toBeCloseTo(992);
    const f = updateElo(1000, 1000, 0);
    expect(f.theta).toBeCloseTo(984);
  });

  it("partial credit at expectation leaves ratings unchanged", () => {
    const r = updateElo(1000, 1000, 0.5);
    expect(r.theta).toBeCloseTo(1000);
  });

  it("rejects outcomes outside [0, 1]", () => {
    expect(() => updateElo(1000, 1000, 2)).toThrow();
  });
});

describe("leitner spacing", () => {
  it("climbs on success, resets on failure, holds on partial", () => {
    expect(nextBox(0, 1)).toBe(1);
    expect(nextBox(4, 1)).toBe(4);
    expect(nextBox(3, 0)).toBe(0);
    expect(nextBox(2, 0.5)).toBe(2);
  });

  it("schedules by box", () => {
    expect(dueAt(0, 0)).toBe(86_400_000);
    expect(dueAt(0, 2)).toBe(7 * 86_400_000);
  });
});

describe("chooseNextDrill", () => {
  it("targets the weakest due tactic", () => {
    const skills: SkillRow[] = [
      { tactic: "urgency", theta: 1200, box: 0, dueAtMs: 0 },
      { tactic: "secrecy", theta: 820, box: 0, dueAtMs: 0, lastPersonaId: "gov-consumer-safety" },
    ];
    // Every other tactic defaults to 1000, so secrecy (820) is weakest.
    const c = chooseNextDrill(skills, scenarios, 1)!;
    expect(c.tactic).toBe("secrecy");
    expect(c.personaId).not.toBe("gov-consumer-safety"); // same tactic, new costume
    expect(c.predictedSuccess).toBeGreaterThan(0);
  });

  it("picks a difficulty whose predicted success is closest to 75%", () => {
    const skills: SkillRow[] = [{ tactic: "fear", theta: 700, box: 0, dueAtMs: 0 }];
    const c = chooseNextDrill(skills, scenarios, 1)!;
    expect(c.tactic).toBe("fear");
    expect(c.difficulty).toBe("easy");
  });

  it("falls back to all tactics when nothing is due", () => {
    const later = 10 * 86_400_000;
    const skills: SkillRow[] = scenarios
      .flatMap((s) => s.tactics)
      .filter((t, i, a) => a.indexOf(t) === i)
      .map((t) => ({ tactic: t, theta: t === "prize" ? 900 : 1100, box: 2, dueAtMs: later }));
    expect(chooseNextDrill(skills, scenarios, 1)!.tactic).toBe("prize");
  });
});
