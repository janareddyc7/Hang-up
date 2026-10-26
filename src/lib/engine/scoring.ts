/**
 * Scoring: point of no return, defense score, outcome class, per-tactic outcomes.
 *
 *   r(t)  = Σ_{i ≤ t} w(tactics of scammer turn i)
 *   t*    = min{ t : r(t) ≥ θ  or a bright-line tactic occurs at t }
 *   S     = clip(100 − P_hard − λ·max(0, t_exit − t*) + min(B, B_max), 0, 100)
 *
 * Outcome classes mirror Yu et al., JAMA Network Open 2023:
 * converted / skeptical engagement / clean exit.
 */
import type { EndReason, ScammerTurn, Turn, UserTurn } from "./schema";
import {
  CLEAN_EXIT_GRACE_TURNS,
  DELAY_PENALTY_PER_TURN,
  HARD_FAIL_PENALTY,
  isHardFail,
  MAX_BONUS,
  MOVE_BONUS,
  PONR_THRESHOLD,
  TACTIC_INFO,
  type HardFail,
  type Tactic,
  type UserMove,
} from "./taxonomy";

export type Outcome = "converted" | "skeptical" | "clean_exit";

export interface PressurePoint {
  k: number;
  r: number;
  tactics: Tactic[];
  brightLine: boolean;
}

export interface TacticOutcome {
  tactic: Tactic;
  /** 1 resisted, 0.5 stayed on but held, 0 fell for it. */
  o: number;
  firstExposureK: number;
}

export interface ScoreResult {
  score: number;
  outcome: Outcome;
  /** Scammer turn index of the point of no return, or null if never reached. */
  pointOfNoReturnK: number | null;
  /** Scammer turns heard before the call ended for the user. */
  exitK: number;
  turnsPastPointOfNoReturn: number;
  msPastPointOfNoReturn: number | null;
  hardFails: HardFail[];
  bonusMoves: UserMove[];
  pressure: PressurePoint[];
  tacticOutcomes: TacticOutcome[];
  /** The one habit to show in the replay. */
  habit: string;
}

const uniq = <T,>(xs: T[]): T[] => [...new Set(xs)];

export function pressureLine(scammerTurns: ScammerTurn[]): PressurePoint[] {
  let r = 0;
  return [...scammerTurns]
    .sort((a, b) => a.k - b.k)
    .map((t) => {
      const tactics = uniq(t.tactics);
      r += tactics.reduce((sum, tac) => sum + TACTIC_INFO[tac].weight, 0);
      return { k: t.k, r, tactics, brightLine: tactics.some((tac) => TACTIC_INFO[tac].brightLine) };
    });
}

export function pointOfNoReturn(pressure: PressurePoint[], threshold = PONR_THRESHOLD): number | null {
  const hit = pressure.find((p) => p.r >= threshold || p.brightLine);
  return hit ? hit.k : null;
}

export function scoreDrill(turns: Turn[], endReason: EndReason): ScoreResult {
  const scammer = turns
    .filter((t): t is ScammerTurn => t.speaker === "scammer" && t.source !== "farewell")
    .sort((a, b) => a.k - b.k);
  const users = turns.filter((t): t is UserTurn => t.speaker === "user");
  const pressure = pressureLine(scammer);
  const ponr = pointOfNoReturn(pressure);
  const lastK = scammer.length > 0 ? scammer[scammer.length - 1]!.k : 0;

  const firstFail = users.find((u) => isHardFail(u.move as UserMove));
  const hardFails = uniq(users.map((u) => u.move as UserMove).filter(isHardFail));
  const exitK = firstFail ? firstFail.afterK : lastK;

  const turnsPast = ponr === null ? 0 : Math.max(0, exitK - ponr);
  const ponrTurn = ponr === null ? undefined : scammer.find((t) => t.k === ponr);
  const exitTurn = scammer.find((t) => t.k === exitK);
  const msPast = ponrTurn && exitTurn ? Math.max(0, exitTurn.tMs - ponrTurn.tMs) : null;

  const pHard = hardFails.reduce((sum, f) => sum + HARD_FAIL_PENALTY[f], 0);
  const bonusMoves = uniq(
    users
      .filter((u) => firstFail === undefined || u.afterK <= firstFail.afterK)
      .map((u) => u.move as UserMove)
      .filter((m) => (MOVE_BONUS[m] ?? 0) > 0),
  );
  const bonus = Math.min(MAX_BONUS, bonusMoves.reduce((sum, m) => sum + (MOVE_BONUS[m] ?? 0), 0));
  const raw = 100 - pHard - DELAY_PENALTY_PER_TURN * turnsPast + bonus;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const outcome: Outcome =
    hardFails.length > 0 ? "converted" : turnsPast <= CLEAN_EXIT_GRACE_TURNS ? "clean_exit" : "skeptical";

  // Per-tactic outcomes feed the skill model.
  const firstExposure = new Map<Tactic, number>();
  for (const p of pressure) for (const tac of p.tactics) if (!firstExposure.has(tac)) firstExposure.set(tac, p.k);
  const tacticOutcomes: TacticOutcome[] = [];
  for (const [tactic, k] of firstExposure) {
    if (outcome === "converted") {
      if (k <= exitK) tacticOutcomes.push({ tactic, o: 0, firstExposureK: k });
    } else if (k <= exitK) {
      tacticOutcomes.push({ tactic, o: outcome === "clean_exit" ? 1 : 0.5, firstExposureK: k });
    }
  }

  void endReason; // reserved: the replay copy differs for scammer_gave_up vs user_hung_up
  return {
    score,
    outcome,
    pointOfNoReturnK: ponr,
    exitK,
    turnsPastPointOfNoReturn: turnsPast,
    msPastPointOfNoReturn: msPast,
    hardFails,
    bonusMoves,
    pressure,
    tacticOutcomes,
    habit: chooseHabit(pressure, ponr, exitK),
  };
}

/** The habit comes from the tactic that should have ended the call: the bright line at t*, else the heaviest tactic heard. */
function chooseHabit(pressure: PressurePoint[], ponr: number | null, exitK: number): string {
  const heard = pressure.filter((p) => p.k <= exitK);
  const atPonr = ponr === null ? undefined : heard.find((p) => p.k === ponr);
  const bright = atPonr?.tactics.find((t) => TACTIC_INFO[t].brightLine);
  if (bright) return TACTIC_INFO[bright].habit;
  const all = heard.flatMap((p) => p.tactics);
  if (all.length === 0) return "Hang up whenever a call feels off. You can always call back on a number you trust.";
  const heaviest = all.reduce((a, b) => (TACTIC_INFO[b].weight > TACTIC_INFO[a].weight ? b : a));
  return TACTIC_INFO[heaviest].habit;
}
