import { describe, expect, it } from "vitest";
import { selectOutcomeCopy } from "@/lib/replay/presentation";

describe("replay outcome copy", () => {
  it("shows calm copy for a clean exit", () => {
    expect(selectOutcomeCopy("clean_exit", 0).title).toBe("You hung up before they could push you");
  });

  it("includes the number of turns after the red flag", () => {
    expect(selectOutcomeCopy("skeptical", 3).message).toContain("3 turns after the red flag");
    expect(selectOutcomeCopy("skeptical", 1).message).toContain("1 turn after the red flag");
  });

  it("does not claim a code was shared for every converted outcome", () => {
    expect(selectOutcomeCopy("converted", 2).message).toContain("where the pressure worked");
    expect(selectOutcomeCopy("converted", 2).message).not.toContain("got the code");
  });

  it("explains when the caller gave up or the call dropped", () => {
    expect(selectOutcomeCopy("clean_exit", 0, "scammer_gave_up").title).toBe("They gave up");
    expect(selectOutcomeCopy("skeptical", 2, "error").title).toBe("Your practice was saved");
  });
});
