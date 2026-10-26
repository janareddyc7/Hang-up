import { describe, expect, it } from "vitest";
import { PilotConfigSchema, phaseAvailable, pilotDueAt, surveyTotal } from "@/lib/pilot/protocol";
import rawConfig from "../../content/pilot.json";
import { assessmentPersona } from "@/lib/pilot/costume";
import { personas } from "../helpers";

const reviewed = {
  ...rawConfig, adultReviewed: true, sourceUrl: "https://example.test/instrument", lowLabel: "Low test anchor", highLabel: "High test anchor",
  items: Array.from({ length: 5 }, (_, i) => ({ id: `test-${i}`, text: `Synthetic test-only item ${i}`, reverse: i === 1 })),
};

describe("pilot protocol", () => {
  it("changes assessment costumes without changing the tactic or goal specification", () => {
    for (const original of personas.values()) {
      const variant = assessmentPersona(original, "pilot:post:test");
      expect(variant.callerName).not.toBe(original.callerName);
      expect(variant.firstMessage).not.toBe(original.firstMessage);
      expect(variant.stages).toEqual(original.stages);
      expect(variant.goal).toEqual(original.goal);
      expect(assessmentPersona(original, "ordinary-practice")).toBe(original);
    }
  });
  it("keeps the supplied unreviewed and incomplete instrument closed", () => {
    expect(PilotConfigSchema.safeParse(rawConfig).success).toBe(false);
    expect(PilotConfigSchema.safeParse({ ...reviewed, adultReviewed: false }).success).toBe(false);
    expect(PilotConfigSchema.safeParse({ ...reviewed, items: [] }).success).toBe(false);
  });
  it("requires all five valid answers and follows configured reverse scoring", () => {
    const config = PilotConfigSchema.parse(reviewed);
    expect(surveyTotal(config, [1, 1, 1, 1, 1])).toBe(9);
    expect(() => surveyTotal(config, [1])).toThrow();
    expect(() => surveyTotal(config, [1, 1, 9, 1, 1])).toThrow();
  });
  it("enforces the four-week training interval and two-week retention interval", () => {
    const day = 86_400_000;
    expect(pilotDueAt("post", 0)).toBe(28 * day);
    expect(pilotDueAt("retention", 0)).toBe(Infinity);
    expect(pilotDueAt("retention", 0, 30 * day)).toBe(44 * day);
    expect(phaseAvailable("post", new Set(), 0, 40 * day)).toBe(false);
    expect(phaseAvailable("post", new Set(["pre"]), 28 * day, 27 * day)).toBe(false);
    expect(phaseAvailable("post", new Set(["pre"]), 28 * day, 28 * day)).toBe(true);
    expect(phaseAvailable("post", new Set(["pre", "post"]), 28 * day, 40 * day)).toBe(false);
  });
});
