import { defineConfig } from "@playwright/test";

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const testPort = process.env.PLAYWRIGHT_PORT ?? "3010";
const baseURL = externalBaseURL ?? `http://localhost:${testPort}`;

if (!externalBaseURL) {
  process.env.HANGUP_NEXT_DIST_DIR ??= ".next-playwright";
  process.env.PORT ??= testPort;
  process.env.HANGUP_E2E_MODE = "true";
  process.env.DATABASE_URL ??= "postgres://hangup:hangup@127.0.0.1:5432/hangup";
  process.env.DATABASE_URL_UNPOOLED ??= process.env.DATABASE_URL;
  process.env.HANGUP_LLM_SECRET ??= "local-e2e-only-secret";
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined),
    trace: "on-first-retry",
  },
  webServer: {
    command: `pnpm dev --port ${testPort}`,
    url: baseURL,
    reuseExistingServer: Boolean(externalBaseURL) && !process.env.CI,
    timeout: 120_000,
  },
});
