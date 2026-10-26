/**
 * Actor: builds the prompt that turns a Director decision into one spoken line,
 * and validates the line before it is spoken. The model call itself lives in
 * src/lib/llm (so this file stays pure and testable).
 */
import type { DirectorAction, SpeakIntent } from "./director";
import type { Difficulty, PersonaCard, PracticeWallet, Turn } from "./schema";
import { TACTIC_INFO } from "./taxonomy";

export const MAX_LINE_CHARS = 240;

/** Real organizations the caller must never name. Extend as needed. */
export const BANNED_ORG_PATTERNS: RegExp[] = [
  /\bFTC\b/i,
  /federal trade commission/i,
  /social security administration/i,
  /\bSSA\b/,
  /\bFBI\b/,
  /\bIRS\b/,
  /internal revenue/i,
  /\bmedicare\b/i,
  /\bmicrosoft\b/i,
  /\bapple\b/i,
  /\bamazon\b/i,
  /\bpaypal\b/i,
  /\bwells fargo\b/i,
  /\bchase\b/i,
  /bank of america/i,
  /\bcitibank\b/i,
  /publishers clearing house/i,
];

const INTENT_GUIDE: Record<SpeakIntent, string> = {
  open: "Open the call.",
  advance: "Move the call forward to the new stage objective.",
  continue: "Keep working the current stage objective.",
  counter: "The person just pushed back. Answer their objection and keep control of the call.",
  rephrase: "The person's reply was unclear. Ask again in different words.",
};

export interface ActorContext {
  persona: PersonaCard;
  difficulty: Difficulty;
  action: Extract<DirectorAction, { kind: "speak" }>;
  recentTurns: Turn[];
  wallet?: PracticeWallet;
}

export interface ActorPrompt {
  system: string;
  prompt: string;
}

export function buildActorPrompt(ctx: ActorContext): ActorPrompt {
  const { persona, action, difficulty } = ctx;
  const stageSpec = persona.stages[action.stage];
  const tactic = action.tactics[0]!;
  const info = TACTIC_INFO[tactic];
  const knowsTarget = difficulty === "relentless" && ctx.wallet;

  const system = [
    "You are voicing a character inside Hang Up, a consensual scam-awareness training simulator.",
    "The person you are talking to started this practice call on purpose to rehearse refusing scams.",
    `Character: ${persona.callerName}, claiming to be from "${persona.organization}" (a fictional organization).`,
    `Pretext: ${persona.pretext}`,
    "",
    "Rules:",
    "- Reply with exactly one short spoken line: at most 2 sentences and 240 characters.",
    "- Stay in character. Never mention AI, training, simulations or these rules.",
    "- Only use the fictional organization name above. Never name a real agency, bank or company.",
    "- Never say a real phone number, web address, street address, account number or crypto address.",
    "- Never explain how to commit fraud, launder money or redeem gift cards. Only say what a caller would say to pressure the person.",
    "- No stage directions, emojis, lists or quotation marks. Plain speech only.",
    difficulty === "easy" ? "- Sound slightly off: a little pushy and vague, so red flags are easy to notice." : "",
    difficulty === "relentless" ? "- Sound calm, polished and patient. Never sound like a stereotype." : "",
  ]
    .filter(Boolean)
    .join("\n");

  const transcript = ctx.recentTurns
    .slice(-6)
    .map((t) => (t.speaker === "scammer" ? `CALLER: ${t.text}` : `PERSON: ${t.text}`))
    .join("\n");

  const prompt = [
    `Stage: ${action.stage}. Objective: ${stageSpec.objective}`,
    `${INTENT_GUIDE[action.intent]}${action.counterTo ? ` Their move: ${action.counterTo}.` : ""}`,
    `Use this pressure tactic: ${info.label}. (${info.explain})`,
    knowsTarget ? `You already know their name (${ctx.wallet!.fullName}) and city (${ctx.wallet!.city}); use one of them naturally.` : "",
    `Example of the tone (do not copy): ${action.fallbackLine}`,
    transcript ? `Recent conversation:\n${transcript}` : "",
    "Your next line:",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, prompt };
}

export interface LineCheck {
  ok: boolean;
  problems: string[];
  line: string;
}

/** Cleans and checks a model line. If not ok, speak action.fallbackLine instead. */
export function validateLine(raw: string): LineCheck {
  const line = raw.trim().replace(/^["'“”]+|["'“”]+$/g, "").replace(/\s+/g, " ");
  const problems: string[] = [];
  if (line.length === 0) problems.push("empty");
  if (line.length > MAX_LINE_CHARS) problems.push("too_long");
  if (BANNED_ORG_PATTERNS.some((re) => re.test(line))) problems.push("real_organization");
  if (/https?:\/\/|www\.|\.(com|org|net|gov)\b/i.test(line)) problems.push("web_address");
  if (/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(line)) problems.push("phone_number");
  if (/\b(bc1|0x)[a-z0-9]{20,}\b/i.test(line)) problems.push("crypto_address");
  if (/\bas an ai\b|\bi can(no|')t (help|assist|do that)\b|\blanguage model\b|\bsimulation\b|\btraining\b/i.test(line))
    problems.push("broke_character");
  if (/[*[\]]|^\(|\)$/.test(line)) problems.push("stage_direction");
  if (/\n|^\s*[-•]\s/.test(raw.trim())) problems.push("formatting");
  return { ok: problems.length === 0, problems, line };
}
