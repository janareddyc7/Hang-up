import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function expectAccessible(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(serious.map((violation) => `${violation.id}: ${violation.help}\n${violation.nodes.map((node) => node.target.join(", ")).join("; ")}`)).toEqual([]);
}

async function tabTo(page: import("@playwright/test").Page, target: { id?: string; text?: string; ariaLabel?: string }) {
  for (let index = 0; index < 70; index++) {
    await page.keyboard.press("Tab");
    const found = await page.evaluate((expected) => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) return false;
      if (!element.matches("a,button,input,select,textarea,summary,[tabindex]")) return false;
      if (expected.id && element.id === expected.id) return true;
      if (expected.ariaLabel && element.getAttribute("aria-label") === expected.ariaLabel) return true;
      return Boolean(expected.text && element.innerText?.trim().includes(expected.text));
    }, target);
    if (found) return;
  }
  throw new Error(`Keyboard focus did not reach ${JSON.stringify(target)}`);
}

test("home offers the scenario list and a clear text route", async ({ page }) => {
  await page.goto("/");
  await expectAccessible(page);

  await expect(page.getByRole("link", { name: "Style guide" })).toHaveCount(0);
  await expect(page.getByLabel("Color theme")).toBeVisible();
  await expect(page.getByRole("group", { name: "Text size" })).toBeVisible();
  const headerRows = await page.evaluate(() => {
    const brand = document.querySelector(".brand");
    const controls = document.querySelector(".header-controls");
    if (!(brand instanceof HTMLElement) || !(controls instanceof HTMLElement)) return null;
    return {
      brandTop: Math.round(brand.getBoundingClientRect().top),
      controlsTop: Math.round(controls.getBoundingClientRect().top),
      controlsRight: Math.round(controls.getBoundingClientRect().right),
      headerRight: Math.round(document.querySelector(".app-header")?.getBoundingClientRect().right ?? 0),
    };
  });
  expect(headerRows).not.toBeNull();
  expect(Math.abs(headerRows!.brandTop - headerRows!.controlsTop)).toBeLessThanOrEqual(2);
  expect(headerRows!.controlsRight).toBeLessThanOrEqual(headerRows!.headerRight);
  await expect(page.getByRole("heading", { name: "Practice saying no before a real scammer calls." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Practice callers" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Practice with text" })).toHaveAttribute("href", "/judge?text=1");
  await expect(page.getByRole("link", { name: "Choose from three practice calls" })).toHaveAttribute("href", "/judge");
  await expect(page.getByRole("heading", { name: "Federal agent says your savings are at risk" })).toBeVisible();
  await expect(page.locator(".recent-calls-list a")).toHaveCount(6);
});

test("Judge mode offers three calls and switches their links to offline text", async ({ page }) => {
  await page.goto("/judge");
  await expectAccessible(page);

  await expect(page.getByRole("heading", { name: "Practice a safe response before a real call." })).toBeVisible();
  const scenarioLinks = page.getByRole("link", { name: "Start this practice" });
  await expect(scenarioLinks).toHaveCount(3);
  await expect(scenarioLinks.nth(0)).toHaveAttribute("href", "/call/gov-consumer-safety?mode=judge&difficulty=realistic");

  await page.getByRole("button", { name: "Text instead of voice" }).click();
  await expect(page.getByRole("button", { name: "Text practice selected" })).toHaveAttribute("aria-pressed", "true");
  await expect(scenarioLinks.nth(0)).toHaveAttribute("href", "/call/gov-consumer-safety?mode=judge&difficulty=realistic&offline=1");
  await expect(scenarioLinks.nth(1)).toHaveAttribute("href", "/call/grandchild-emergency?mode=judge&difficulty=realistic&offline=1");
  await expect(scenarioLinks.nth(2)).toHaveAttribute("href", "/call/bank-fraud-department?mode=judge&difficulty=easy&offline=1");
});

test("Judge mode opens directly with the offline text option selected", async ({ page }) => {
  await page.goto("/judge?text=1");

  await expect(page.getByRole("button", { name: "Text practice selected" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: "Start this practice" }).first()).toHaveAttribute("href", /offline=1/);
});

test("a guest can complete offline text practice, reach replay, and keep it private", async ({ page, browser }) => {
  await page.goto("/judge?text=1");
  await page.getByRole("link", { name: "Start this practice" }).first().click();
  await page.getByRole("button", { name: "Answer practice call" }).click();
  await expect(page.locator(".call-status")).toContainText("Text practice");
  await expect(page.locator(".captions")).toContainText("Good afternoon");
  await expectAccessible(page);

  for (let turn = 0; turn < 4; turn++) {
    await page.getByLabel("Your reply").fill("Okay, I understand.");
    await page.getByRole("button", { name: "Send reply" }).click();
    await expect(page.getByLabel("Your reply")).toBeEnabled();
  }
  await page.getByLabel("Your reply").fill("I'm hanging up now. Goodbye.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page).toHaveURL(/\/replay\//);
  await expect(page.getByRole("heading", { name: "The conversation" })).toBeVisible();
  await expect(page.getByText("I'm hanging up now. Goodbye.")).toBeVisible();
  await expect(page.locator(".replay-score-number")).toContainText("/ 100");
  await expect(page.locator(".replay-tactics").first()).toBeVisible();
  await expect(page.getByText("This is where to hang up")).toBeVisible();
  await expectAccessible(page);

  const layout = page.locator(".replay-layout");
  await expect(layout).toHaveCSS("grid-template-areas", '"transcript summary"');
  for (const theme of ["light", "dark", "high-contrast"] as const) {
    await page.getByRole("combobox", { name: "Color theme" }).selectOption(theme);
    if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
    if (theme === "high-contrast") await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
    if (theme === "light") await expect(page.locator("html")).not.toHaveClass(/dark/);
    if (process.env.HANGUP_CAPTURE_REPLAY === "1") {
      await page.screenshot({ path: `test-results/replay-${theme}-desktop.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(layout).toHaveCSS("grid-template-areas", '"summary" "transcript"');
  for (const theme of ["light", "dark", "high-contrast"] as const) {
    await page.getByRole("combobox", { name: "Color theme" }).selectOption(theme);
    if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
    if (theme === "high-contrast") await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
    if (theme === "light") await expect(page.locator("html")).not.toHaveClass(/dark/);
    if (process.env.HANGUP_CAPTURE_REPLAY === "1") {
      await page.screenshot({ path: `test-results/replay-${theme}-mobile.png`, fullPage: true });
    }
  }

  const stranger = await browser.newPage();
  const replayUrl = new URL(page.url());
  const response = await stranger.goto(`${replayUrl.origin}${replayUrl.pathname}`);
  expect(response?.status()).toBe(404);
  await stranger.close();
});

test("a keyboard-only visitor can finish offline text practice and read the replay", async ({ page }) => {
  await page.goto("/judge?text=1");
  await tabTo(page, { text: "Start this practice" });
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/call\//);
  await tabTo(page, { ariaLabel: "Answer practice call" });
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Your reply")).toBeVisible();

  for (let turn = 0; turn < 4; turn++) {
    await tabTo(page, { id: "reply" });
    await page.keyboard.type("Okay, I understand.");
    await expect(page.getByRole("button", { name: "Send reply", exact: true })).toBeEnabled();
    await tabTo(page, { text: "Send reply" });
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Your reply")).toBeEnabled();
    await expect(page.getByLabel("Your reply")).toHaveValue("");
  }
  await tabTo(page, { id: "reply" });
  await page.keyboard.type("I'm hanging up now. Goodbye.");
  await expect(page.getByRole("button", { name: "Send reply", exact: true })).toBeEnabled();
  await tabTo(page, { text: "Send reply" });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/replay\//);
  await expect(page.getByRole("heading", { name: "The conversation" })).toBeVisible();
  await expect(page.getByText("This is where to hang up")).toBeVisible();
  await expect(page.locator(".replay-score-number")).toContainText("/ 100");
});
