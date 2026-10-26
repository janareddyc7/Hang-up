/**
 * Practice Wallet: a fictional identity shown on screen during drills, so users
 * never have a reason to say real personal data. Also: deterministic detection
 * of wallet "leaks" and redaction of anything number-shaped before storage.
 */
import { hashSeed, mulberry32, pick } from "./rng";
import type { PracticeWallet } from "./schema";

const FIRST = ["Pat", "Jordan", "Lee", "Morgan", "Robin", "Casey", "Dana", "Terry"];
const LAST = ["Rivera", "Okafor", "Lindqvist", "Brennan", "Castillo", "Nakamura", "Whitfield", "Dubois"];
const CITIES = ["Dayton, Ohio", "Tucson, Arizona", "Spokane, Washington", "Macon, Georgia", "Erie, Pennsylvania"];
// Fictional institutions only.
const BANKS = ["Lakeshore Community Bank", "Prairie Mutual Savings", "Harborline Credit Union"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function digits(rng: () => number, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(rng() * 10).toString();
  return s;
}

/**
 * SSN format 9xx-00-xxxx: area 900-999 is never issued as an SSN, and group 00
 * is never valid for SSNs or ITINs, so the number cannot belong to anyone.
 * Card numbers start with 9999, which no card network issues.
 */
export function generateWallet(seed: string): PracticeWallet {
  const rng = mulberry32(hashSeed("wallet", seed));
  const month = Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 28);
  const year = 1942 + Math.floor(rng() * 20);
  return {
    fullName: `${pick(rng, FIRST)} ${pick(rng, LAST)}`,
    city: pick(rng, CITIES),
    dateOfBirth: `${MONTHS[month]} ${day}, ${year}`,
    ssn: `9${digits(rng, 2)}-00-${digits(rng, 4)}`,
    bankName: pick(rng, BANKS),
    accountNumber: digits(rng, 10),
    cardNumber: `9999 ${digits(rng, 4)} ${digits(rng, 4)} ${digits(rng, 4)}`,
    oneTimeCode: digits(rng, 6),
  };
}

const WORD_DIGITS: Record<string, string> = {
  zero: "0", oh: "0", o: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};
/** "oh" and "o" are only zero when next to other digits ("five oh one"), never in "oh, I see". */
const AMBIGUOUS_ZERO = new Set(["oh", "o"]);

function core(token: string): { pre: string; word: string; post: string } {
  const m = /^([^a-z0-9]*)([a-z0-9']*)([^a-z0-9]*)$/i.exec(token);
  return m ? { pre: m[1]!, word: m[2]!.toLowerCase(), post: m[3]! } : { pre: "", word: token.toLowerCase(), post: "" };
}

function isDigitWord(word: string | undefined): boolean {
  return word !== undefined && (/^\d+$/.test(word) || (WORD_DIGITS[word] !== undefined && !AMBIGUOUS_ZERO.has(word)));
}

/**
 * Replaces spoken digits with numerals while keeping everything else
 * (case, punctuation, spacing): "It's six five oh, double nine." -> "It's 6 5 0, 99."
 */
export function spokenDigitsToNumerals(text: string): string {
  const parts = text.split(/(\s+)/);
  const wordIdx = parts.map((p, i) => (p.trim() ? i : -1)).filter((i) => i >= 0);
  const words = wordIdx.map((i) => core(parts[i]!));
  for (let w = 0; w < words.length; w++) {
    const { pre, word, post } = words[w]!;
    const next = words[w + 1];
    if ((word === "double" || word === "triple") && next && WORD_DIGITS[next.word] !== undefined) {
      parts[wordIdx[w]!] = pre + WORD_DIGITS[next.word]!.repeat(word === "double" ? 2 : 3) + next.post;
      parts[wordIdx[w + 1]!] = "";
      parts[wordIdx[w]! + 1] = ""; // drop the space between the merged words
      words[w + 1] = { pre: "", word: "", post: "" };
      w++;
      continue;
    }
    if (WORD_DIGITS[word] === undefined) continue;
    if (AMBIGUOUS_ZERO.has(word) && !(isDigitWord(words[w - 1]?.word) || isDigitWord(next?.word))) continue;
    parts[wordIdx[w]!] = pre + WORD_DIGITS[word]! + post;
  }
  return parts.join("");
}

/**
 * Detection form: spoken digits as numerals, lowercase, punctuation removed.
 * "Nine eight double five oh one" -> "9 8 55 0 1"
 */
export function normalizeSpokenDigits(text: string): string {
  return spokenDigitsToNumerals(text)
    .toLowerCase()
    .replace(/[,.;:!?]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** All digits in order, ignoring everything else. */
export function digitStream(text: string): string {
  return normalizeSpokenDigits(text).replace(/\D/g, "");
}

export type WalletField = "ssn" | "account" | "card" | "code" | "dob";

export interface LeakResult {
  leaked: boolean;
  fields: WalletField[];
}

const MIN_MATCH = 4;

function containsRunOf(haystack: string, secret: string, minLen = MIN_MATCH): boolean {
  if (haystack.length < minLen) return false;
  for (let len = Math.min(secret.length, haystack.length); len >= minLen; len--) {
    for (let i = 0; i + len <= secret.length; i++) {
      if (haystack.includes(secret.slice(i, i + len))) return true;
    }
  }
  return false;
}

/**
 * Exact, deterministic leak detection. A leak is any run of 4+ digits copied
 * from a wallet number, or the birth month together with the day or year.
 * Known limit: a coincidental 4-digit overlap counts as a leak; with four
 * secrets this is rare and the replay lets the user flag it.
 */
export function detectWalletLeak(text: string, wallet: PracticeWallet): LeakResult {
  const stream = digitStream(text);
  const fields: WalletField[] = [];
  const secrets: [WalletField, string][] = [
    ["ssn", wallet.ssn.replace(/\D/g, "")],
    ["account", wallet.accountNumber],
    ["card", wallet.cardNumber.replace(/\D/g, "").slice(4)], // skip the shared 9999 prefix
    ["code", wallet.oneTimeCode],
  ];
  for (const [field, secret] of secrets) {
    if (containsRunOf(stream, secret)) fields.push(field);
  }
  const normalized = normalizeSpokenDigits(text);
  const [monthName, dayComma, year] = wallet.dateOfBirth.split(" ");
  const month = monthName!.toLowerCase();
  const day = dayComma!.replace(",", "");
  if (normalized.includes(month)) {
    const hasDay = new RegExp(`\\b${day}(st|nd|rd|th)?\\b`).test(normalized);
    const hasYear = normalized.includes(year!);
    if (hasDay || hasYear) fields.push("dob");
  }
  return { leaked: fields.length > 0, fields };
}

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const DIGIT_RUN = /\d(?:[\s,.-]?\d)*/g;

/**
 * Redacts anything that could be personal data before storage or logging, on
 * the original text (case and punctuation kept):
 * - email addresses
 * - any digit run that copies 4+ digits of a Practice Wallet number
 * - any other run of 5+ digits (allowing single spaces, commas, dots or dashes)
 */
export function redact(text: string, wallet?: PracticeWallet): string {
  let t = spokenDigitsToNumerals(text.replace(EMAIL, "[email removed]"));
  if (wallet) {
    const secrets = [wallet.ssn, wallet.accountNumber, wallet.cardNumber.slice(5), wallet.oneTimeCode].map((x) =>
      x.replace(/\D/g, ""),
    );
    t = t.replace(DIGIT_RUN, (run) => {
      const d = run.replace(/\D/g, "");
      return secrets.some((sec) => containsRunOf(d, sec)) ? "[practice number]" : run;
    });
  }
  return t.replace(/\d(?:[\s-]?\d){4,}/g, "[number removed]");
}
