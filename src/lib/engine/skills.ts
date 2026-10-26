/**
 * Adaptive curriculum: Elo-style skill per (user, tactic), item difficulty per
 * (scenario, tactic, difficulty), Leitner-box spacing, and next-drill choice.
 *
 *   p      = 1 / (1 + 10^((d − θ)/400))
 *   θ_new  = θ + K_user · (o − p)
 *   d_new  = d − K_item · (o − p)
 */
import type { Difficulty } from "./schema";
import { TACTICS, type Tactic } from "./taxonomy";

export const DEFAULT_RATING = 1000;
export const DIFFICULTY_BASE: Record<Difficulty, number> = { easy: 900, realistic: 1000, relentless: 1150 };
export const K_USER = 32;
export const K_ITEM = 16;
export const TARGET_SUCCESS = 0.75;
export const SUCCESS_BAND: [number, number] = [0.6, 0.85];
export const INTERVAL_DAYS = [1, 3, 7, 21, 60] as const;
const DAY_MS = 86_400_000;

export function expectedSuccess(theta: number, d: number): number {
  return 1 / (1 + Math.pow(10, (d - theta) / 400));
}

export function updateElo(theta: number, d: number, o: number): { theta: number; d: number; p: number } {
  if (o < 0 || o > 1) throw new Error("outcome must be in [0, 1]");
  const p = expectedSuccess(theta, d);
  return { theta: theta + K_USER * (o - p), d: d - K_ITEM * (o - p), p };
}

export function nextBox(box: number, o: number): number {
  if (o >= 0.75) return Math.min(box + 1, INTERVAL_DAYS.length - 1);
  if (o < 0.25) return 0;
  return box;
}

export function dueAt(nowMs: number, box: number): number {
  const days = INTERVAL_DAYS[Math.max(0, Math.min(box, INTERVAL_DAYS.length - 1))]!;
  return nowMs + days * DAY_MS;
}

export interface SkillRow {
  tactic: Tactic;
  theta: number;
  box: number;
  dueAtMs: number;
  /** Persona last used to train this tactic, for "same tactic, new costume". */
  lastPersonaId?: string;
}

export interface ScenarioOption {
  personaId: string;
  tactics: Tactic[];
}

export interface DrillChoice {
  tactic: Tactic;
  personaId: string;
  difficulty: Difficulty;
  predictedSuccess: number;
}

export type ItemDifficulty = (personaId: string, tactic: Tactic, difficulty: Difficulty) => number;

export const baseItemDifficulty: ItemDifficulty = (_p, _t, difficulty) => DIFFICULTY_BASE[difficulty];

/**
 * Choose the next drill:
 * 1. the due tactic with the lowest skill (all tactics if none are due),
 * 2. a scenario featuring it, preferring a different persona than last time,
 * 3. the difficulty whose predicted success is closest to TARGET_SUCCESS.
 */
export function chooseNextDrill(
  skills: SkillRow[],
  scenarios: ScenarioOption[],
  nowMs: number,
  itemDifficulty: ItemDifficulty = baseItemDifficulty,
): DrillChoice | null {
  const known = new Map(skills.map((s) => [s.tactic, s]));
  const rows: SkillRow[] = TACTICS.filter((t) => scenarios.some((s) => s.tactics.includes(t))).map(
    (t) => known.get(t) ?? { tactic: t, theta: DEFAULT_RATING, box: 0, dueAtMs: 0 },
  );
  if (rows.length === 0) return null;
  const due = rows.filter((r) => r.dueAtMs <= nowMs);
  const pool = due.length > 0 ? due : rows;
  const target = pool.reduce((a, b) => (b.theta < a.theta ? b : a));

  const featuring = scenarios.filter((s) => s.tactics.includes(target.tactic));
  const fresh = featuring.filter((s) => s.personaId !== target.lastPersonaId);
  const candidates = fresh.length > 0 ? fresh : featuring;

  let best: DrillChoice | null = null;
  for (const s of candidates) {
    for (const difficulty of ["easy", "realistic", "relentless"] as const) {
      const p = expectedSuccess(target.theta, itemDifficulty(s.personaId, target.tactic, difficulty));
      const inBand = p >= SUCCESS_BAND[0] && p <= SUCCESS_BAND[1];
      const dist = Math.abs(p - TARGET_SUCCESS) + (inBand ? 0 : 1);
      const bestDist = best ? Math.abs(best.predictedSuccess - TARGET_SUCCESS) + (inBandOf(best) ? 0 : 1) : Infinity;
      if (dist < bestDist) best = { tactic: target.tactic, personaId: s.personaId, difficulty, predictedSuccess: p };
    }
  }
  return best;
}

function inBandOf(c: DrillChoice): boolean {
  return c.predictedSuccess >= SUCCESS_BAND[0] && c.predictedSuccess <= SUCCESS_BAND[1];
}
