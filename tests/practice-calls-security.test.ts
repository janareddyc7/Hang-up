import { describe, expect, it } from "vitest";

import { decryptPhone, encryptPhone, isWithinPracticeWindow, localDateKey } from "../src/lib/practice-calls/security";

const key = Buffer.alloc(32, 7).toString("base64");

describe("Practice Call security helpers", () => {
  it("encrypts phone numbers with authenticated, non-repeating ciphertext", () => {
    const first = encryptPhone("+14155552671", key);
    const second = encryptPhone("+14155552671", key);
    expect(first).not.toBe(second);
    expect(first).not.toContain("+14155552671");
    expect(decryptPhone(first, key)).toBe("+14155552671");
  });

  it("rejects a modified ciphertext and malformed encryption keys", () => {
    const encrypted = encryptPhone("+14155552671", key);
    const [iv, tag, ciphertext] = encrypted.split(".");
    const changedCiphertext = `${ciphertext?.[0] === "a" ? "b" : "a"}${ciphertext?.slice(1)}`;
    expect(() => decryptPhone(`${iv}.${tag}.${changedCiphertext}`, key)).toThrow();
    expect(() => encryptPhone("+14155552671", "not-a-key")).toThrow(/32-byte key/);
  });

  it("uses the participant's local timezone and enforces the 08:00–21:00 limit", () => {
    const schedule = { daysOfWeek: [1], windowStartMinute: 600, windowEndMinute: 1140, timezone: "America/New_York" };
    expect(isWithinPracticeWindow(schedule, new Date("2026-10-26T14:00:00.000Z"))).toBe(true);
    expect(isWithinPracticeWindow(schedule, new Date("2026-10-26T11:59:00.000Z"))).toBe(false);
    expect(isWithinPracticeWindow({ ...schedule, daysOfWeek: [2] }, new Date("2026-10-27T01:00:00.000Z"))).toBe(false);
    expect(isWithinPracticeWindow({ ...schedule, windowStartMinute: 7 * 60 }, new Date("2026-10-26T14:00:00.000Z"))).toBe(false);
    expect(localDateKey("America/Los_Angeles", new Date("2026-10-26T02:00:00.000Z"))).toBe("2026-10-25");
  });
});
