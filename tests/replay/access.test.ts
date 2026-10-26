import { describe, expect, it } from "vitest";
import { resolveReplayAccess } from "@/lib/replay/access";

describe("replay access", () => {
  it("allows the owner and a guest Judge replay from its browser session", () => {
    expect(resolveReplayAccess({ recordUserId: "user-1", mode: "sparring", viewerId: "user-1" })).toBe("owner");
    expect(resolveReplayAccess({ recordUserId: null, mode: "judge", viewerId: null })).toBe("denied");
    expect(resolveReplayAccess({ recordUserId: null, mode: "judge", viewerId: null, guestSessionMatches: true })).toBe("judge");
  });

  it("gives a coach transcript access only when the trainee enabled sharing", () => {
    expect(resolveReplayAccess({
      recordUserId: "trainee",
      mode: "sparring",
      viewerId: "coach",
      coachMemberships: [{ shareTranscripts: true }],
    })).toBe("coach_shared");
    expect(resolveReplayAccess({
      recordUserId: "trainee",
      mode: "sparring",
      viewerId: "coach",
      coachMemberships: [{ shareTranscripts: false }],
    })).toBe("coach_scores");
  });

  it("denies a different user and a coach from an unrelated circle", () => {
    expect(resolveReplayAccess({ recordUserId: "owner", mode: "sparring", viewerId: "stranger" })).toBe("denied");
    expect(resolveReplayAccess({ recordUserId: "trainee", mode: "sparring", viewerId: "coach", coachMemberships: [] })).toBe("denied");
  });
});
