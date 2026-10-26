import { describe, expect, it } from "vitest";
import type { ScammerTurn, Turn, UserTurn } from "../../src/lib/engine/schema";
import { pointOfNoReturn, pressureLine, scoreDrill } from "../../src/lib/engine/scoring";
import type { Tactic, UserMove } from "../../src/lib/engine/taxonomy";

let clock = 0;
const s = (k: number, tactics: Tactic[]): ScammerTurn => ({
  speaker: "scammer", k, stage: "pressure", tactics, text: `line ${k}`, source: "model", tMs: (clock += 5000),
});
const u = (afterK: number, move: UserMove): UserTurn => ({
  speaker: "user", afterK, text: "...", move, confidence: 1, decidedBy: "rule", tMs: (clock += 3000),
});

describe("pressure line and point of no return", () => {
  it("accumulates weights and stops at the threshold", () => {
    const p = pressureLine([s(1, ["authority"]), s(2, ["urgency"]), s(3, ["fear"])]);
    expect(p.map((x) => x.r)).toEqual([1, 3, 5]);
    expect(pointOfNoReturn(p)).toBe(3);
  });

  it("a bright line sets the point of no return immediately", () => {
    const p = pressureLine([s(1, ["authority"]), s(2, ["secrecy"])]);
    expect(pointOfNoReturn(p)).toBe(2);
  });

  it("is null when pressure never builds", () => {
    expect(pointOfNoReturn(pressureLine([s(1, ["authority"])]))).toBeNull();
  });
});

describe("scoreDrill", () => {
  it("early hang-up scores 100 and is a clean exit", () => {
    const turns: Turn[] = [s(1, ["authority"]), u(1, "hang_up")];
    const r = scoreDrill(turns, "user_hung_up");
    expect(r.score).toBe(100);
    expect(r.outcome).toBe("clean_exit");
    expect(r.pointOfNoReturnK).toBeNull();
    expect(r.tacticOutcomes).toEqual([{ tactic: "authority", o: 1, firstExposureK: 1 }]);
  });

  it("staying on past the point of no return is skeptical engagement", () => {
    const turns: Turn[] = [
      s(1, ["authority"]), u(1, "question"),
      s(2, ["secrecy"]), u(2, "refuse"),     // point of no return at k=2
      s(3, ["fear"]), u(3, "refuse"),
      s(4, ["urgency"]), u(4, "refuse"),
      s(5, ["unusual_payment"]), u(5, "hang_up"),
    ];
    const r = scoreDrill(turns, "user_hung_up");
    expect(r.pointOfNoReturnK).toBe(2);
    expect(r.turnsPastPointOfNoReturn).toBe(3);
    expect(r.outcome).toBe("skeptical");
    // 100 - 8*3 + refuse bonus 5
    expect(r.score).toBe(81);
    expect(r.msPastPointOfNoReturn).toBeGreaterThan(0);
    expect(r.tacticOutcomes.every((t) => t.o === 0.5)).toBe(true);
  });

  it("a hard fail is converted and penalized", () => {
    const turns: Turn[] = [
      s(1, ["authority"]), u(1, "comply_minor"),
      s(2, ["credential_request"]), u(2, "share_code"),
      s(3, ["urgency"]), // spoken after the fail, not counted against the user
    ];
    const r = scoreDrill(turns, "converted");
    expect(r.outcome).toBe("converted");
    expect(r.hardFails).toEqual(["share_code"]);
    expect(r.exitK).toBe(2);
    expect(r.score).toBe(60); // 100 - 40, no turns past the point of no return
    expect(r.habit).toMatch(/code/i);
    expect(r.tacticOutcomes.map((t) => t.tactic).sort()).toEqual(["authority", "credential_request"]);
    expect(r.tacticOutcomes.every((t) => t.o === 0)).toBe(true);
  });

  it("verification earns a capped bonus but never outweighs a hard fail", () => {
    const turns: Turn[] = [
      s(1, ["authority"]), u(1, "verify_independent"),
      s(2, ["family_emergency"]), u(2, "ask_safe_word"),
      s(3, ["unusual_payment"]), u(3, "agree_payment"),
    ];
    const r = scoreDrill(turns, "converted");
    expect(r.score).toBe(70); // 100 - 50 + min(30, 20)
    expect(r.outcome).toBe("converted");
  });

  it("ignores farewell lines", () => {
    const farewell: ScammerTurn = { ...s(3, []), source: "farewell" };
    const turns: Turn[] = [s(1, ["authority"]), u(1, "refuse"), s(2, ["fear"]), u(2, "refuse"), farewell];
    const r = scoreDrill(turns, "scammer_gave_up");
    expect(r.exitK).toBe(2);
    expect(r.outcome).toBe("clean_exit");
  });

  it("the score is clipped to 0..100", () => {
    const turns: Turn[] = [s(1, ["remote_access"]), u(1, "agree_remote_access"), u(1, "disclose"), u(1, "agree_payment")];
    expect(scoreDrill(turns, "converted").score).toBe(0);
  });
});
