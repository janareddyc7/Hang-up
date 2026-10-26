import { config } from "dotenv";
import { spawnSync } from "node:child_process";
config({ path: ".env.local", quiet: true });

const branch = process.argv[2];
const expectedHost = process.argv[3];
if (!branch?.startsWith("hangup-qa-") || !expectedHost?.endsWith(".neon.tech")) throw new Error("Pass an explicit QA branch and its verified Neon host.");
const cli = spawnSync("pnpm", ["dlx", "neon@latest", "connection-string", branch, "--project-id", "odd-darkness-82635688", "--ssl", "verify-full"], { shell: process.platform === "win32", encoding: "utf8", windowsHide: true, timeout: 30_000 });
const connection = cli.stdout?.match(/postgres(?:ql)?:\/\/[^\s"']+/)?.[0];
if (cli.status !== 0 || !connection || new URL(connection).hostname !== expectedHost) throw new Error("Test connection did not match the isolated QA host. No tests run.");
console.log("Running integration tests on the verified schema-only QA branch. Production is not used.");
const run = spawnSync("pnpm", ["test"], {
  shell: process.platform === "win32", encoding: "utf8", windowsHide: true, timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
  env: { ...process.env, DATABASE_URL: connection, DATABASE_URL_UNPOOLED: connection, TEST_DATABASE_URL: connection },
});
const sanitize = (text: string | null) => (text ?? "").replaceAll(connection, "[redacted database URL]");
console.log(sanitize(run.stdout));
if (run.stderr) console.error(sanitize(run.stderr));
process.exitCode = run.status ?? 1;
