import { describe, expect, it } from "vitest";
import { initialState, MAX_SCAMMER_TURNS, openingAction, step, type DrillState } from "../../src/lib/engine/director";
import { STAGES } from "../../src/lib/engine/schema";
import type { UserMove } from "../../src/lib/engine/taxonomy";
import { persona } from "../helpers";

const gov = persona("gov-consumer-safety");

function open(difficulty: "easy" | "realistic" | "relentless" = "realistic"): DrillState {
  return openingAction(initialState(gov, difficulty, "seed-1"), gov).state;
}

function run(state: DrillState, moves: UserMove[]) {
  const actions = [];
  for (const m of moves) {
    const r = step(state, gov, m);
    state = r.state;
    actions.push(r.action);
    if (r.action.kind === "end") break;
  }
  return { state, actions };
}

describe("director", () => {
  it("opens with the persona's first message in the hook stage", () => {
    const r = openingAction(initialState(gov, "realistic", "s"), gov);
    expect(r.action.kind).toBe("speak");
    if (r.action.kind === "speak") {
      expect(r.action.stage).toBe("hook");
      expect(r.action.fallbackLine).toBe(gov.firstMessage);
      expect(gov.stages.hook.allowedTactics).toContain(r.action.tactics[0]);
    }
    expect(r.state.k).toBe(1);
  });

  it("is deterministic for the same seed and moves", () => {
    const moves: UserMove[] = ["comply_minor", "question", "comply_minor", "comply_minor"];
    expect(run(open(), moves)).toEqual(run(open(), moves));
  });

  it("walks every stage in order when the user goes along", () => {
    const { actions } = run(open(), Array(10).fill("comply_minor"));
    const stages = actions.filter((a) => a.kind === "speak").map((a) => (a.kind === "speak" ? a.stage : null));
    const order = stages.map((s) => STAGES.indexOf(s!));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(stages).toContain("payment_ask");
    for (const a of actions) {
      if (a.kind === "speak") expect(gov.stages[a.stage].allowedTactics).toContain(a.tactics[0]);
    }
  });

  it("answers resistance with a counter-objection in the same stage", () => {
    const s = open();
    const r = step(s, gov, "refuse");
    expect(r.action.kind).toBe("speak");
    if (r.action.kind === "speak") {
      expect(r.action.intent).toBe("counter");
      expect(r.action.stage).toBe(s.stage);
      expect(r.action.counterTo).toBe("refuse");
    }
  });

  it("gives up after enough resistance on realistic", () => {
    const { actions } = run(open("realistic"), ["refuse", "question", "refuse", "refuse"]);
    const last = actions.at(-1)!;
    expect(last.kind).toBe("end");
    if (last.kind === "end") expect(last.reason).toBe("scammer_gave_up");
  });

  it("hangs up on a single verification move on easy", () => {
    const last = step(open("easy"), gov, "verify_independent").action;
    expect(last.kind === "end" && last.reason).toBe("scammer_gave_up");
  });

  it("never gives up on relentless", () => {
    const { actions } = run(open("relentless"), Array(10).fill("refuse"));
    expect(actions.every((a) => a.kind === "speak")).toBe(true);
  });

  it("ends as converted on any hard fail", () => {
    const { state, actions } = run(open(), ["comply_minor", "agree_payment"]);
    const last = actions.at(-1)!;
    expect(last.kind === "end" && last.reason).toBe("converted");
    expect(state.hardFails).toEqual(["agree_payment"]);
  });

  it("ends when the user hangs up", () => {
    const last = step(open(), gov, "hang_up").action;
    expect(last.kind === "end" && last.reason).toBe("user_hung_up");
  });

  it("ends at the turn limit", () => {
    const { actions } = run(open("relentless"), Array(MAX_SCAMMER_TURNS + 5).fill("unclear"));
    const last = actions.at(-1)!;
    expect(last.kind === "end" && last.reason).toBe("turn_limit");
  });

  it("refuses to step an ended drill", () => {
    const ended = step(open(), gov, "hang_up").state;
    expect(() => step(ended, gov, "comply_minor")).toThrow();
  });
});
