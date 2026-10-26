import "server-only";
import { createHash } from "node:crypto";

/** Hash invite secrets before they reach persistent storage. */
export function hashCircleInvite(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
