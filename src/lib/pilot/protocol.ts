import { z } from "zod";

export const PilotPhaseSchema = z.enum(["pre", "post", "retention"]);
export type PilotPhase = z.infer<typeof PilotPhaseSchema>;
export const PILOT_PHASES = PilotPhaseSchema.options;
export const PilotConfigSchema = z.object({
  adultReviewed: z.literal(true), consentVersion: z.string().min(3), consentText: z.string().min(100),
  citation: z.string().min(20), sourceUrl: z.url(),
  minimum: z.number().int().min(0), maximum: z.number().int().max(10),
  lowLabel: z.string().min(1), highLabel: z.string().min(1),
  items: z.array(z.object({ id: z.string().min(1).max(40), text: z.string().min(5).max(600), reverse: z.boolean() }).strict()).length(5),
}).strict().refine((v) => v.maximum > v.minimum && new Set(v.items.map((i) => i.id)).size === 5);
export type PilotConfig = z.infer<typeof PilotConfigSchema>;

export function surveyTotal(config: PilotConfig, answers: number[]): number {
  const parsed = z.array(z.number().int().min(config.minimum).max(config.maximum)).length(5).parse(answers);
  return parsed.reduce((sum, answer, i) => sum + (config.items[i]!.reverse ? config.minimum + config.maximum - answer : answer), 0);
}

const DAY = 24 * 60 * 60 * 1000;
export function pilotDueAt(phase: PilotPhase, consentAtMs: number, postFinishedAtMs?: number): number {
  if (phase === "pre") return consentAtMs;
  if (phase === "post") return consentAtMs + 28 * DAY;
  return postFinishedAtMs === undefined ? Number.POSITIVE_INFINITY : postFinishedAtMs + 14 * DAY;
}

export function phaseAvailable(phase: PilotPhase, completed: ReadonlySet<PilotPhase>, dueAtMs: number, nowMs: number): boolean {
  const prior = phase === "post" ? "pre" : phase === "retention" ? "post" : null;
  return !completed.has(phase) && (!prior || completed.has(prior)) && nowMs >= dueAtMs;
}
