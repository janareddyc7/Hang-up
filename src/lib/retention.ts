export const JUDGE_DRILL_RETENTION_DAYS = 7;

export function judgeDrillRetentionCutoff(nowMs: number): Date {
  return new Date(nowMs - JUDGE_DRILL_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
