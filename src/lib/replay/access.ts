export type ReplayAccess = "owner" | "judge" | "coach_shared" | "coach_scores" | "denied";

export interface ReplayAccessInput {
  recordUserId: string | null;
  mode: string;
  viewerId: string | null;
  /** True only when the request carries the anonymous trainee's private browser session. */
  guestSessionMatches?: boolean;
  /** Memberships returned only for circles shared by this trainee and viewer. */
  coachMemberships?: { shareTranscripts: boolean }[];
}

export function resolveReplayAccess({ recordUserId, mode, viewerId, guestSessionMatches = false, coachMemberships = [] }: ReplayAccessInput): ReplayAccess {
  if (recordUserId === null && mode === "judge") return guestSessionMatches ? "judge" : "denied";
  if (viewerId && recordUserId === viewerId) return "owner";
  if (!viewerId || coachMemberships.length === 0) return "denied";
  return coachMemberships.some((membership) => membership.shareTranscripts) ? "coach_shared" : "coach_scores";
}
