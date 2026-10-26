/**
 * The Director: a deterministic state machine that decides WHAT the scammer
 * does next. The language model (the Actor) only decides HOW to say it.
 *
 * Pure functions, no I/O. Same (state, persona, move) always gives the same result.
 */
import { hashSeed, mulberry32, pick } from "./rng";
import type { Difficulty, EndReason, PersonaCard, Stage } from "./schema";
import { STAGES } from "./schema";
import { isHardFail, RESISTANCE_MOVES, type HardFail, type Tactic, type UserMove } from "./taxonomy";

export interface DifficultyRules {
  /** Resistance moves the scammer tolerates before giving up. */
  giveUpAfterResistance: number;
  /** Whether a single independent-verification move makes the scammer hang up. */
  endsOnVerify: boolean;
  /** Minimum scammer turns spent in a stage before advancing. */
  minTurnsPerStage: number;
}

export const DIFFICULTY_RULES: Record<Difficulty, DifficultyRules> = {
  easy: { giveUpAfterResistance: 2, endsOnVerify: true, minTurnsPerStage: 1 },
  realistic: { giveUpAfterResistance: 4, endsOnVerify: false, minTurnsPerStage: 1 },
  relentless: { giveUpAfterResistance: Number.POSITIVE_INFINITY, endsOnVerify: false, minTurnsPerStage: 2 },
};

export const MAX_SCAMMER_TURNS = 18;

export interface DrillState {
  personaId: string;
  difficulty: Difficulty;
  seed: string;
  stage: Stage;
  /** Scammer turns spent in the current stage. */
  stageTurns: number;
  /** Total scammer turns so far (k). */
  k: number;
  resistance: number;
  usedTactics: Tactic[];
  stageTactics: Tactic[];
  hardFails: HardFail[];
  ended: boolean;
  endReason?: EndReason;
}

export type SpeakIntent = "open" | "advance" | "continue" | "counter" | "rephrase";

export type DirectorAction =
  | {
      kind: "speak";
      k: number;
      stage: Stage;
      tactics: Tactic[];
      intent: SpeakIntent;
      counterTo?: UserMove;
      /** Pre-written line used if the Actor fails validation or the model is down. */
      fallbackLine: string;
    }
  | {
      kind: "end";
      reason: EndReason;
      /** Last thing the scammer says, if anything. */
      line?: string;
      tactics: Tactic[];
    };

export interface StepResult {
  state: DrillState;
  action: DirectorAction;
}

export function initialState(persona: PersonaCard, difficulty: Difficulty, seed: string): DrillState {
  return {
    personaId: persona.id,
    difficulty,
    seed,
    stage: "hook",
    stageTurns: 0,
    k: 0,
    resistance: 0,
    usedTactics: [],
    stageTactics: [],
    hardFails: [],
    ended: false,
  };
}

function rngFor(state: DrillState): () => number {
  return mulberry32(hashSeed(state.seed, state.personaId, state.k, state.resistance));
}

function chooseTactic(state: DrillState, persona: PersonaCard, stage: Stage, rng: () => number): Tactic {
  const allowed = persona.stages[stage].allowedTactics;
  const fresh = allowed.filter((t) => !state.stageTactics.includes(t));
  return pick(rng, fresh.length > 0 ? fresh : allowed);
}

function speak(
  state: DrillState,
  stage: Stage,
  intent: SpeakIntent,
  tactic: Tactic,
  fallbackLine: string,
  counterTo?: UserMove,
): StepResult {
  const stageChanged = stage !== state.stage;
  const next: DrillState = {
    ...state,
    stage,
    k: state.k + 1,
    stageTurns: stageChanged ? 1 : state.stageTurns + 1,
    stageTactics: stageChanged ? [tactic] : [...state.stageTactics, tactic],
    usedTactics: state.usedTactics.includes(tactic) ? state.usedTactics : [...state.usedTactics, tactic],
  };
  const action: DirectorAction = { kind: "speak", k: next.k, stage, tactics: [tactic], intent, fallbackLine };
  if (counterTo) action.counterTo = counterTo;
  return { state: next, action };
}

function end(state: DrillState, reason: EndReason, line?: string, tactics: Tactic[] = []): StepResult {
  const action: DirectorAction = { kind: "end", reason, tactics };
  if (line) action.line = line;
  return { state: { ...state, ended: true, endReason: reason }, action };
}

/** The scammer's opening line. Call once, before the first user turn. */
export function openingAction(state: DrillState, persona: PersonaCard): StepResult {
  if (state.k !== 0) throw new Error("openingAction must be the first action of a drill");
  const tactic = chooseTactic(state, persona, "hook", rngFor(state));
  return speak(state, "hook", "open", tactic, persona.firstMessage);
}

function nextStage(stage: Stage): Stage | null {
  const i = STAGES.indexOf(stage);
  return i < STAGES.length - 1 ? STAGES[i + 1]! : null;
}

/** Advance the drill by one user move. */
export function step(state: DrillState, persona: PersonaCard, move: UserMove): StepResult {
  if (state.ended) throw new Error("step() called on an ended drill");
  if (persona.id !== state.personaId) throw new Error("persona does not match drill state");
  const rules = DIFFICULTY_RULES[state.difficulty];
  const rng = rngFor(state);

  if (move === "hang_up") return end(state, "user_hung_up");

  if (isHardFail(move)) {
    const s = { ...state, hardFails: [...state.hardFails, move] };
    return end(s, "converted", persona.convertedLine);
  }

  if (state.k >= MAX_SCAMMER_TURNS) return end(state, "turn_limit", persona.givesUpLine);

  if (RESISTANCE_MOVES.includes(move)) {
    const resistance = state.resistance + 1;
    const s = { ...state, resistance };
    if (move === "verify_independent" && rules.endsOnVerify) return end(s, "scammer_gave_up", persona.givesUpLine);
    if (resistance >= rules.giveUpAfterResistance) return end(s, "scammer_gave_up", persona.givesUpLine);
    const matching = persona.counterObjections.filter((c) => c.trigger === move);
    const counter = pick(rng, matching.length > 0 ? matching : persona.counterObjections);
    return speak(s, state.stage, "counter", counter.tactic, pick(rng, counter.lines), move);
  }

  if (move === "unclear") {
    const tactic = chooseTactic(state, persona, state.stage, rng);
    return speak(state, state.stage, "rephrase", tactic, pick(rng, persona.stages[state.stage].fallbackLines));
  }

  // comply_minor: the user is going along. Advance when the stage has had its turns.
  const canAdvance = state.stageTurns >= rules.minTurnsPerStage;
  const target = canAdvance ? nextStage(state.stage) ?? state.stage : state.stage;
  const intent: SpeakIntent = target !== state.stage ? "advance" : "continue";
  const probe = target !== state.stage ? { ...state, stageTactics: [] } : state;
  const tactic = chooseTactic(probe, persona, target, rng);
  return speak(state, target, intent, tactic, pick(rng, persona.stages[target].fallbackLines));
}
