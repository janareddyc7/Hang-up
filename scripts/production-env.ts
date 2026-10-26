import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
config({ path: ".env.local", quiet: true });

// Explicit allowlist: never upload local test flags, localhost origins, or unrelated credentials.
const keys = ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "BETTER_AUTH_SECRET", "RESEND_API_KEY", "EMAIL_FROM", "AI_GATEWAY_API_KEY", "ACTOR_MODEL", "CLASSIFIER_MODEL", "ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID", "ELEVENLABS_VOICE_IDS", "HANGUP_LLM_SECRET"];
const values = Object.fromEntries(keys.flatMap((key) => process.env[key] ? [[key, process.env[key]!]] : []));
Object.assign(values, { CRON_SECRET: randomBytes(32).toString("base64url"), PRACTICE_CALLS_ENABLED: "false", PRACTICE_CALLS_ADULT_REVIEWED: "false", PILOT_ENABLED: "false" });

for (const [key, value] of Object.entries(values)) {
  if (!process.argv.includes("--apply")) { console.log(`Would configure production ${key}`); continue; }
  const result = spawnSync("pnpm", ["dlx", "vercel@65.2.0", "env", "add", key, "--environment", "production", "--sensitive", "--force", "--yes"], {
    shell: process.platform === "win32", input: value, encoding: "utf8", timeout: 60_000, windowsHide: true,
  });
  // CLI output is deliberately suppressed; only the key name and exit status are reported.
  if (result.status !== 0) { console.error(`Production ${key} failed (exit ${result.status ?? "timeout"}).`); process.exitCode = 1; break; }
  console.log(`Configured production ${key}`);
}
