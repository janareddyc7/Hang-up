import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateText } from "ai";
import { config as loadEnv } from "dotenv";
import { validateLine } from "../src/lib/engine/actor";
import { detectWalletLeak } from "../src/lib/engine/wallet";
import type { RuntimeDeps } from "../src/lib/drill/runtime";
import type { Difficulty } from "../src/lib/engine/schema";

type BotName = "Compliant" | "Skeptical" | "Verifier" | "Confused";
type Result = { persona: string; difficulty: Difficulty; bot: BotName; run: number; outcome: string; score: number; turns: number; fallbackRate: number; checks: string[] };
const botNames: BotName[] = ["Compliant", "Skeptical", "Verifier", "Confused"];
const difficulties: Difficulty[] = ["easy", "realistic", "relentless"];

function args(argv: string[]) {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const part = argv[i]!;
    if (!part.startsWith("--")) continue;
    const [key, inline] = part.slice(2).split("=", 2);
    const value = inline ?? argv[i + 1];
    if (value && !value.startsWith("--")) result[key!] = value;
  }
  return result;
}

function promptFor(bot: BotName, callerLine: string, walletCode: string, turn: number): { instructions: string; prompt: string } {
  const instructions: Record<BotName, string> = {
    Compliant: "You are a cooperative but ordinary person on a fictional scam-awareness practice call. Go along with the caller, agree to the requested action, and share the practice code if asked. Never make up or use real personal information.",
    Skeptical: "You are wary but do not hang up immediately. Ask reasonable questions, refuse to act, and stay on the line unless the caller ends the practice. Never disclose a code or agree to a risky action.",
    Verifier: "You are careful. You will verify independently using a number you already trust and then end the call. Do not disclose information or agree to the caller's request.",
    Confused: "You are a confused person who asks for repetition and wanders slightly off topic. Do not provide personal details, agree to payments, share codes, or intentionally hang up.",
  };
  const codeRule = bot === "Compliant" ? `If the caller directly asks for a one-time code, use this fictional practice code: ${walletCode}.` : "Never reveal a code.";
  const firstVerifierTurn = bot === "Verifier" && turn === 0 ? "Say you will call the bank yourself using the number on your card, then say goodbye." : "";
  return {
    instructions: `${instructions[bot]} ${codeRule} ${firstVerifierTurn} Reply with only one short sentence as the person on the call.`,
    prompt: `The caller just said: ${callerLine}\nWhat do you say?`,
  };
}

function expectedChecks(result: Result): string[] {
  const checks: string[] = [];
  if (result.bot === "Compliant") {
    if (result.outcome !== "converted") checks.push("expected converted outcome");
    if (result.score > 60) checks.push("expected score at most 60");
  } else if (result.bot === "Skeptical") {
    if (result.outcome !== "skeptical" && result.outcome !== "clean_exit") checks.push("expected a non-converted skeptical outcome");
  } else if (result.bot === "Verifier") {
    if (result.outcome !== "clean_exit") checks.push("expected clean exit");
    if (result.score < 80) checks.push("expected score at least 80");
  } else if (result.outcome === "converted") checks.push("confused bot must not hard-fail");
  if (result.fallbackRate >= 0.2) checks.push("fallback rate must be under 20%");
  return checks;
}

async function simulate(
  base: RuntimeDeps,
  runtime: typeof import("../src/lib/drill/runtime"),
  personaId: string,
  difficulty: Difficulty,
  bot: BotName,
  run: number,
): Promise<Result> {
  const store = new runtime.InMemoryDrillStore();
  const id = `bot-${crypto.randomUUID()}`;
  const deps: RuntimeDeps = { ...base, store, newId: () => `${id}-${crypto.randomUUID()}` };
  const created = await runtime.createDrill(deps, { personaId, difficulty, userId: null, mode: "judge", seed: `${id}-${run}` });
  let latest = created.record;
  let turnsSent = 0;
  for (; turnsSent < 20; turnsSent++) {
    latest = (await store.get(id) ?? await store.get(created.drillId))!;
    const lastCaller = [...latest.turns].reverse().find((turn) => turn.speaker === "scammer");
    if (!lastCaller || latest.status !== "live") break;
    const botPrompt = promptFor(bot, lastCaller.text, latest.wallet.oneTimeCode, turnsSent);
    let reply = "I am not sure. Could you repeat that?";
    try {
      const generated = await generateText({ model: base.classifierModel, instructions: botPrompt.instructions, prompt: botPrompt.prompt, maxOutputTokens: 80, temperature: 0.4, abortSignal: AbortSignal.timeout(5_000) });
      if (generated.text.trim()) reply = generated.text.trim().slice(0, 500);
    } catch {
      // A deterministic safe reply keeps the run inspectable if the bot model times out.
    }
    const result = await runtime.runTurn(deps, { drillId: created.drillId, userText: reply });
    if (result.kind === "end") break;
  }
  latest = (await store.get(created.drillId))!;
  const score = latest.status === "ended" && latest.score ? latest.score : await runtime.finishDrill(deps, created.drillId, "turn_limit");
  latest = (await store.get(created.drillId))!;
  const callerTurns = latest.turns.filter((turn) => turn.speaker === "scammer");
  const invalidLines = callerTurns.filter((turn) => {
    const valid = validateLine(turn.text).ok;
    return !valid && turn.source !== "fallback" && turn.source !== "first_message" && turn.source !== "farewell";
  });
  const walletLeaks = callerTurns.filter((turn) => detectWalletLeak(turn.text, latest.wallet).leaked);
  const modelLines = callerTurns.filter((turn) => turn.source === "model").length;
  const fallbackLines = callerTurns.filter((turn) => turn.source === "fallback").length;
  const result: Result = {
    persona: personaId,
    difficulty,
    bot,
    run,
    outcome: score.outcome,
    score: score.score,
    turns: latest.turns.filter((turn) => turn.speaker === "user").length,
    fallbackRate: modelLines + fallbackLines > 0 ? fallbackLines / (modelLines + fallbackLines) : 0,
    checks: [],
  };
  if (invalidLines.length) result.checks.push("invalid non-fallback scammer line");
  if (walletLeaks.length) result.checks.push("scammer line repeated a fictional wallet number");
  result.checks.push(...expectedChecks(result));
  return result;
}

async function main() {
  const envFile = existsSync(resolve(process.cwd(), ".env.local")) ? ".env.local" : ".env";
  loadEnv({ path: resolve(process.cwd(), envFile) });
  const [{ getRuntimeDeps }, runtime] = await Promise.all([
    import("../src/lib/drill/deps"),
    import("../src/lib/drill/runtime"),
  ]);
  const options = args(process.argv.slice(2));
  const base = getRuntimeDeps();
  const personas = options.persona ? [options.persona] : [...base.personas.keys()];
  const selectedDifficulty = options.difficulty as Difficulty | undefined;
  const selectedBot = options.bot ? (botNames.find((bot) => bot.toLowerCase() === options.bot!.toLowerCase()) ?? null) : undefined;
  const runCount = Math.max(1, Math.min(25, Number.parseInt(options.runs ?? "1", 10) || 1));
  if (selectedDifficulty && !difficulties.includes(selectedDifficulty)) throw new Error("--difficulty must be easy, realistic, or relentless");
  if (options.bot && !selectedBot) throw new Error("--bot must be Compliant, Skeptical, Verifier, or Confused");
  if (personas.some((id) => !base.personas.has(id))) throw new Error("Unknown persona id.");
  const results: Result[] = [];
  for (const personaId of personas) {
    for (const difficulty of selectedDifficulty ? [selectedDifficulty] : difficulties) {
      for (const bot of selectedBot ? [selectedBot] : botNames) {
        for (let run = 1; run <= runCount; run++) results.push(await simulate(base, runtime, personaId, difficulty, bot, run));
      }
    }
  }
  const reportDate = new Date().toISOString().slice(0, 10);
  const reportPath = resolve("reports", `bots-${reportDate}.md`);
  mkdirSync(resolve("reports"), { recursive: true });
  const lines = [
    `# Simulated user report — ${reportDate}`,
    "",
    "This report records aggregate scenario outcomes only; it contains no turns, transcript text, names, or wallet values.",
    "",
    "| Persona | Difficulty | Bot | Run | Outcome | Score | User turns | Fallback rate | Checks |",
    "|---|---|---:|---:|---|---:|---:|---:|---|",
    ...results.map((row) => `| ${row.persona} | ${row.difficulty} | ${row.bot} | ${row.run} | ${row.outcome} | ${row.score} | ${row.turns} | ${(row.fallbackRate * 100).toFixed(1)}% | ${row.checks.join("; ") || "pass"} |`),
    "",
    `Runs: ${results.length} · Passed: ${results.filter((row) => row.checks.length === 0).length} · Failed: ${results.filter((row) => row.checks.length > 0).length}`,
    "",
  ];
  writeFileSync(reportPath, lines.join("\n"), { encoding: "utf8", flag: "w" });
  console.table(results.map(({ persona, difficulty, bot, outcome, score, fallbackRate, checks }) => ({ persona, difficulty, bot, outcome, score, fallback: `${(fallbackRate * 100).toFixed(0)}%`, result: checks.length ? checks.join("; ") : "pass" })));
  console.log(`Wrote ${reportPath}`);
  if (results.some((row) => row.checks.length > 0)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Bot harness failed.");
  process.exitCode = 1;
});
