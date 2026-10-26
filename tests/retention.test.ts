import { describe, expect, it } from "vitest";
import { JUDGE_DRILL_RETENTION_DAYS, judgeDrillRetentionCutoff } from "../src/lib/retention";

describe("Judge drill retention", () => {
  it("deletes only after a full seven days", () => {
    const now = Date.UTC(2026, 9, 26, 12);
    expect(JUDGE_DRILL_RETENTION_DAYS).toBe(7);
    expect(judgeDrillRetentionCutoff(now).getTime()).toBe(now - 7 * 24 * 60 * 60 * 1000);
  });
});
