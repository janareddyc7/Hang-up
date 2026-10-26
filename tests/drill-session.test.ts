import { describe, expect, it } from "vitest";
import { mintDrillSession, verifyDrillSession } from "../src/lib/drill/session-token";

describe("signed voice drill session", () => {
  const secret = "test-session-secret";
  it("preserves the drill and owner without provider user_id forwarding", () => {
    const token = mintDrillSession(secret, { drillId: "d1", userId: "u1", expiresAt: 2000 });
    expect(verifyDrillSession(secret, token, 1000)).toEqual({ drillId: "d1", userId: "u1", expiresAt: 2000 });
  });
  it("rejects changed claims, wrong keys, malformed and expired tokens", () => {
    const token = mintDrillSession(secret, { drillId: "d1", userId: "u1", expiresAt: 2000 });
    const payload = Buffer.from(JSON.stringify({ drillId: "d2", userId: "u2", expiresAt: 2000 })).toString("base64url");
    expect(verifyDrillSession(secret, `${payload}.${token.split(".")[1]}`, 1000)).toBeNull();
    expect(verifyDrillSession("wrong", token, 1000)).toBeNull();
    expect(verifyDrillSession(secret, token, 2000)).toBeNull();
    expect(verifyDrillSession(secret, "invalid", 1000)).toBeNull();
  });
});
