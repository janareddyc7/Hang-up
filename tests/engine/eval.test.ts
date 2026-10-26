import { describe, expect, it } from "vitest";
import { cohensKappa, precisionRecall } from "../../src/lib/eval/kappa";

describe("agreement metrics", () => {
  it("perfect agreement is 1", () => {
    expect(cohensKappa(["refuse", "comply_minor"], ["refuse", "comply_minor"])).toBe(1);
  });
  it("matches a hand-computed example", () => {
    // po = 0.7, pe = 0.5*0.6 + 0.5*0.4 = 0.5, kappa = 0.4
    const a = ["y", "y", "y", "y", "y", "n", "n", "n", "n", "n"];
    const b = ["y", "y", "y", "y", "n", "y", "y", "n", "n", "n"];
    expect(cohensKappa(a, b)).toBeCloseTo(0.4);
  });
  it("computes precision and recall for hard-fail labels", () => {
    const pred = ["share_code", "refuse", "share_code", "refuse"];
    const gold = ["share_code", "share_code", "refuse", "refuse"];
    expect(precisionRecall(pred, gold, "share_code")).toEqual({ precision: 0.5, recall: 0.5, support: 2 });
  });
});
