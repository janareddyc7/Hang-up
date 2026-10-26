import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const origin = "https://hang-up-theta.vercel.app";
mkdirSync("reports/demo", { recursive: true });
const browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: "reports/demo", size: { width: 1280, height: 800 } } });
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const video = page.video();
try {
  await page.goto(origin);
  await expect(page.getByRole("heading", { name: "Practice saying no before a real scammer calls." })).toBeVisible();
  await page.waitForTimeout(3500);
  await page.getByRole("link", { name: "Choose from three practice calls" }).click();
  await page.getByRole("button", { name: "Text instead of voice" }).click();
  await page.waitForTimeout(2500);
  await page.getByRole("link", { name: "Start this practice" }).first().click();
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "Answer practice call", exact: true }).click();
  await expect(page.locator(".call-status")).toHaveText("Text practice");
  await page.waitForTimeout(2500);
  for (const reply of ["Okay, I understand.", "I see.", "I'll call the agency myself."]) {
    await page.getByLabel("Your reply").pressSequentially(reply, { delay: 45 });
    await page.getByRole("button", { name: "Send reply", exact: true }).click();
    await expect(page.getByLabel("Your reply")).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByLabel("Your reply")).toHaveValue("");
    await page.waitForTimeout(2500);
  }
  await page.getByRole("button", { name: "Hang up", exact: true }).click();
  await expect(page).toHaveURL(/\/replay\//);
  await expect(page.getByRole("heading", { name: "The conversation", exact: true })).toBeVisible();
  await page.waitForTimeout(4000);
  await page.locator(".replay-pressure-figure").scrollIntoViewIfNeeded().catch(() => undefined);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "reports/demo/replay.png", fullPage: true });
  console.log("PASS Recorded real production text practice through replay; no microphone or ElevenLabs voice session.");
} finally {
  await context.close();
  if (video) await video.saveAs("reports/demo/hang-up-text-demo.webm");
  await browser.close();
}
