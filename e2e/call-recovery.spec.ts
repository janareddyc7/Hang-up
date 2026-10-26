import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("microphone denial offers text practice without a provider session", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: () => Promise.reject(new DOMException("Denied", "NotAllowedError")) });
  });
  let providerRequests = 0;
  page.on("request", (request) => { if (request.url().includes("api.elevenlabs.io")) providerRequests++; });
  await page.goto("/call/bank-fraud-department?mode=judge&difficulty=easy");
  await page.getByRole("button", { name: "Answer practice call" }).click();
  await expect(page.getByText("Your microphone is unavailable.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Continue with text", exact: true }).click();
  await expect(page.locator(".call-status")).toHaveText("Text practice");
  await expect(page.getByLabel("Your reply")).toBeEnabled();
  await page.getByRole("button", { name: "Hang up", exact: true }).click();
  await expect(page).toHaveURL(/\/replay\//);
  expect(providerRequests).toBe(0);
});

test("failed replies keep the draft and a failed finish offers replay retry", async ({ page }) => {
  await page.goto("/call/gov-consumer-safety?mode=judge&difficulty=easy&offline=1");
  await page.getByRole("button", { name: "Answer practice call" }).click();
  await expect(page.getByLabel("Your reply")).toBeVisible();
  await page.route("**/call/**", (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 503, body: "Temporarily unavailable" }) : route.continue());
  await page.getByLabel("Your reply").fill("Please explain that again.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("Your reply could not be sent.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Your reply")).toHaveValue("Please explain that again.");
  await page.getByRole("button", { name: "Hang up", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry replay" })).toBeEnabled();
  await expect(page.getByLabel("Your reply")).toBeDisabled();
  await page.unroute("**/call/**");
  await page.getByRole("button", { name: "Retry replay" }).click();
  await expect(page).toHaveURL(/\/replay\//);
  await expect(page.locator(".replay-score-number")).toBeVisible();
});

test("mobile large text stays readable and the active text call is accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Use 1.5× text size", exact: true }).click();
  await page.getByRole("combobox", { name: "Color theme" }).selectOption("high-contrast");
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(await fits()).toBe(true);
  await page.goto("/call/gov-consumer-safety?mode=judge&difficulty=easy&offline=1");
  await page.getByRole("button", { name: "Answer practice call" }).click();
  await expect(page.getByLabel("Your reply")).toBeVisible();
  expect(await fits()).toBe(true);
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(scan.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await page.getByRole("button", { name: "Hang up", exact: true }).click();
  await expect(page).toHaveURL(/\/replay\//);
});
