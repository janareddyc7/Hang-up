import { config } from "dotenv";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { Pool } from "pg";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

config({ path: ".env.local", quiet: true });
const branch = process.argv[2];
const expectedHost = process.argv[3];
if (!branch?.startsWith("hangup-qa-") || !expectedHost?.endsWith(".neon.tech")) throw new Error("An explicit QA branch and verified host are required.");
const cli = spawnSync("pnpm", ["dlx", "neon@latest", "connection-string", branch, "--project-id", "odd-darkness-82635688", "--ssl", "verify-full"], { shell: process.platform === "win32", encoding: "utf8", windowsHide: true, timeout: 30_000 });
const connection = cli.stdout?.match(/postgres(?:ql)?:\/\/[^\s"']+/)?.[0];
if (cli.status !== 0 || !connection || new URL(connection).hostname !== expectedHost) throw new Error("QA connection does not match. Nothing started.");
const pool = new Pool({ connectionString: connection });
const userId = `browser-qa-${crypto.randomUUID()}`;
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) throw new Error("Auth test secret missing.");
const baseURL = "http://localhost:3012";
let stage = "seed";

await pool.query('insert into "user" (id,name,email,email_verified) values($1,$2,$3,true)', [userId, "Synthetic QA user", `${userId}@example.test`]);
await pool.query('insert into profiles(user_id,display_name) values($1,$2)', [userId, "Synthetic QA user"]);
// Obtain a genuine Better Auth cookie through a mocked email transport, never real mail.
Object.assign(process.env, { DATABASE_URL: connection, DATABASE_URL_UNPOOLED: connection, APP_URL: baseURL, BETTER_AUTH_URL: baseURL });
const { auth } = await import("../src/auth");
const realFetch = globalThis.fetch;
let signInUrl: string | undefined;
globalThis.fetch = async (input, init) => {
  if (String(input) === "https://api.resend.com/emails") {
    const body = JSON.parse(String(init?.body)) as { text: string };
    signInUrl = body.text.match(/http:\/\/localhost:3012\/\S+/)?.[0];
    return new Response(JSON.stringify({ id: "synthetic-qa-no-email-sent" }), { status: 200 });
  }
  return realFetch(input, init);
};
let sessionCookies: string[];
try {
  const sent = await auth.handler(new Request(`${baseURL}/api/auth/sign-in/magic-link`, { method: "POST", headers: { origin: baseURL, "content-type": "application/json" }, body: JSON.stringify({ email: `${userId}@example.test`, callbackURL: "/settings" }) }));
  if (!sent.ok || !signInUrl) throw new Error("Synthetic auth handshake failed");
  const verified = await auth.handler(new Request(signInUrl));
  sessionCookies = verified.headers.getSetCookie();
} finally { globalThis.fetch = realFetch; }
const server = spawn("pnpm", ["dev", "--port", "3012"], {
  shell: process.platform === "win32", windowsHide: true, stdio: "ignore",
  env: { ...process.env, HANGUP_NEXT_DIST_DIR: ".next-qa-browser", HANGUP_E2E_MODE: "false", DATABASE_URL: connection, DATABASE_URL_UNPOOLED: connection, APP_URL: baseURL, BETTER_AUTH_URL: baseURL, PILOT_ENABLED: "false", PRACTICE_CALLS_ENABLED: "false", PRACTICE_CALLS_ADULT_REVIEWED: "false" },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  stage = "server startup";
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(baseURL, { signal: AbortSignal.timeout(3000) })).ok) break; } catch { /* Wait for the owned server only. */ }
    if (i === 89) throw new Error("QA server timeout");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined });
  const facilitator = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await facilitator.addCookies(sessionCookies!.map((cookie) => {
    const pair = cookie.split(";", 1)[0]!;
    const separator = pair.indexOf("=");
    return { name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseURL, httpOnly: true, sameSite: "Lax" as const };
  }));
  const page = await facilitator.newPage();
  page.setDefaultTimeout(30_000);
  stage = "settings save and reload";
  await page.goto(`${baseURL}/settings`);
  await page.locator("#settings-text-scale").selectOption("1.25");
  await page.locator("#settings-speech-rate").selectOption("0.9");
  await page.getByLabel("Use high contrast", { exact: true }).check();
  await page.getByLabel("Start calls in text mode").check();
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByText("Your settings are saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("#settings-text-scale")).toHaveValue("1.25");
  await expect(page.locator("#settings-speech-rate")).toHaveValue("0.9");
  await expect(page.getByLabel("Start calls in text mode")).toBeChecked();
  await expect(page.getByRole("combobox", { name: "Color theme" })).toHaveValue("high-contrast");
  stage = "header preference stability";
  await page.getByRole("combobox", { name: "Color theme" }).selectOption("dark");
  await expect(page.getByRole("combobox", { name: "Color theme" })).toHaveValue("dark");
  await expect.poll(async () => (await pool.query('select high_contrast from profiles where user_id=$1', [userId])).rows[0]?.high_contrast).toBe(false);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Color theme" })).toHaveValue("dark");
  console.log("PASS Signed-in settings, all controls, persistence, and header theme stability");
  stage = "signed-in accessibility and navigation";
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(scan.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  const navFits = await page.evaluate(() => {
    const nav = document.querySelector(".main-nav");
    const controls = document.querySelector(".header-controls");
    return Boolean(nav && controls && nav.getBoundingClientRect().right <= controls.getBoundingClientRect().left);
  });
  expect(navFits).toBe(true);
  console.log("PASS Signed-in dark settings accessibility and non-overlapping desktop navigation");
  mkdirSync("reports/qa", { recursive: true });
  await page.screenshot({ path: "reports/qa/settings-desktop.png", fullPage: true });
  stage = "circle creation";
  await page.goto(`${baseURL}/circle`);
  await page.getByLabel("Circle name", { exact: true }).fill("Synthetic QA family");
  await page.getByRole("button", { name: "Create a Family Circle", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Synthetic QA family", exact: true })).toBeVisible();
  console.log("PASS Signed-in Family Circle creation and dashboard navigation");
  stage = "two-browser group";
  await page.goto(`${baseURL}/facilitate`);
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  const code = (await page.locator(".group-join-code").innerText()).trim();
  const participant = await browser.newContext();
  const member = await participant.newPage();
  await member.goto(`${baseURL}/group/${code}`);
  await expect(member.getByText("You’re in.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Start projected text call", exact: true }).click();
  await page.getByRole("button", { name: "Answer practice call", exact: true }).click();
  await expect(page.locator(".call-status")).toHaveText("Text practice");
  await member.getByRole("button", { name: "Hang up now", exact: true }).click();
  await expect(member.getByRole("button", { name: "Vote recorded", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Hang up", exact: true }).click();
  await expect(page).toHaveURL(/\/replay\//);
  await expect(page.locator(".group-replay-caption")).toBeVisible();
  await expect(member.getByText("This practice room has ended.", { exact: false })).toBeVisible();
  console.log("PASS Two independent browsers: room join, projected text call, one vote, replay histogram, room closure");
  await page.screenshot({ path: "reports/qa/group-replay.png", fullPage: true });
  stage = "sign-out";
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  console.log("PASS Sign-out immediately refreshes navigation");
} catch (error) {
  console.error(`FAIL Browser QA at ${stage}: ${error instanceof Error ? error.message.replaceAll(connection, "[redacted]").slice(0, 900) : "unexpected error"}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server.pid) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    else server.kill("SIGTERM");
  }
  await pool.query('delete from "user" where id=$1', [userId]);
  await pool.end();
}
