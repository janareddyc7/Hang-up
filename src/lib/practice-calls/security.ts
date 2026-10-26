import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type PracticeCallSchedule = {
  daysOfWeek: number[];
  windowStartMinute: number;
  windowEndMinute: number;
  timezone: string;
};

export function localDateKey(timezone: string, date: Date): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (!values.year || !values.month || !values.day) return null;
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return null;
  }
}

function keyBytes(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.byteLength !== 32 || key.toString("base64") !== encodedKey) {
    throw new Error("Phone encryption requires a base64-encoded 32-byte key.");
  }
  return key;
}

/** AES-256-GCM authenticated encryption; the IV and tag are stored beside ciphertext. */
export function encryptPhone(phone: string, encodedKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(encodedKey), iv);
  const ciphertext = Buffer.concat([cipher.update(phone, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptPhone(encrypted: string, encodedKey: string): string {
  const [ivPart, tagPart, ciphertextPart, extra] = encrypted.split(".");
  if (!ivPart || !tagPart || !ciphertextPart || extra !== undefined) throw new Error("Encrypted phone value is malformed.");
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");
  if (iv.byteLength !== 12 || tag.byteLength !== 16 || ciphertext.byteLength < 1) {
    throw new Error("Encrypted phone value is malformed.");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(encodedKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Check schedule using the participant's IANA time zone, including daylight-saving shifts. */
export function isWithinPracticeWindow(schedule: PracticeCallSchedule, now: Date): boolean {
  if (
    schedule.daysOfWeek.length === 0
    || schedule.daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
    || schedule.windowStartMinute < 8 * 60
    || schedule.windowStartMinute > 20 * 60
    || schedule.windowEndMinute > 21 * 60
    || schedule.windowEndMinute <= schedule.windowStartMinute
  ) return false;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: schedule.timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return false;
  }
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(values.weekday ?? "");
  const minute = Number(values.hour) * 60 + Number(values.minute);
  return day >= 0 && schedule.daysOfWeek.includes(day)
    && minute >= schedule.windowStartMinute && minute < schedule.windowEndMinute;
}
