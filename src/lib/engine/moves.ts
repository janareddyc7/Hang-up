/**
 * Rule-based user-move detection. Runs before the language-model classifier.
 * Rules are exact and cheap; anything they don't catch goes to the classifier.
 */
import type { PracticeWallet } from "./schema";
import type { UserMove } from "./taxonomy";
import { detectWalletLeak, normalizeSpokenDigits, type WalletField } from "./wallet";

export interface RuleDecision {
  move: UserMove;
  confidence: number;
  decidedBy: "rule";
  leakedFields?: WalletField[];
}

const HANG_UP = /\b(i'?m hanging up|i am hanging up|hanging up now|i'?m going to hang up|goodbye|bye[- ]?bye|bye now)\b/;
const VERIFY =
  /\b(call (you|them|the bank|my bank|the number|that number|the office) back|number on (the back of )?my card|i'?ll call (my bank|the bank|them|the office|the agency) (myself|directly)|look up the (real )?number|call the real number)\b/;
const SAFE_WORD = /\b(safe word|code word|secret word|family word|what'?s our (word|password))\b/;
const PRACTICE_STOP = /\b(stop practice|unsubscribe)\b/i;
const NEGATED_PRACTICE_STOP = /\b(?:don'?t|do not|never|not|won'?t|will not)\s+(?:want to\s+|need to\s+)?stop practice\b/i;
const SHORT_STOP = /^(?:(?:please|okay|ok)\s+)?stop(?:\s+(?:now|please|calling me|these calls))?[.!?\s]*$/i;
// An acknowledgment alone supplies no information and agrees to no specific risky action.
const ACKNOWLEDGMENT = /^(?:(?:ok(?:ay)?|yes|sure|alright|all right)(?:[,\s]+(?:i (?:understand|see)|got it))?|i (?:understand|see)|got it)[,.!?\s]*$/i;

export function isPracticeStopPhrase(text: string): boolean {
  const normalized = normalizeSpokenDigits(text).trim();
  if (NEGATED_PRACTICE_STOP.test(normalized)) return /\bunsubscribe\b/i.test(normalized);
  return PRACTICE_STOP.test(normalized) || SHORT_STOP.test(normalized);
}

export function decideByRules(text: string, wallet: PracticeWallet, mode?: "practice_call"): RuleDecision | null {
  // An explicit opt-out takes precedence over any accidental practice-wallet disclosure.
  if (mode === "practice_call" && isPracticeStopPhrase(text)) {
    return { move: "hang_up", confidence: 1, decidedBy: "rule" };
  }
  const leak = detectWalletLeak(text, wallet);
  if (leak.leaked) {
    const onlyCode = leak.fields.every((f) => f === "code");
    return { move: onlyCode ? "share_code" : "disclose", confidence: 1, decidedBy: "rule", leakedFields: leak.fields };
  }
  const t = normalizeSpokenDigits(text);
  if (HANG_UP.test(t)) return { move: "hang_up", confidence: 0.95, decidedBy: "rule" };
  if (SAFE_WORD.test(t)) return { move: "ask_safe_word", confidence: 0.9, decidedBy: "rule" };
  if (VERIFY.test(t)) return { move: "verify_independent", confidence: 0.9, decidedBy: "rule" };
  if (t.trim() && ACKNOWLEDGMENT.test(t)) return { move: "comply_minor", confidence: 0.95, decidedBy: "rule" };
  return null;
}
