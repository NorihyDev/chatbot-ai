import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        authenticated: true,
        passwordConfigured: false,
        ready: true,
        model: "test-model",
      },
    }),
  );
});

test("welcome, dark theme, settings, and navigation pass accessibility checks", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /What are we/ }),
  ).toBeVisible();
  async function check() {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  }
  await check();
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await check();
  await page.getByRole("button", { name: "Nova AI", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Your workspace" }),
  ).toBeVisible();
  await check();
  await page.keyboard.press("Escape");
  if (isMobile) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      page.getByRole("dialog", { name: "Chat navigation" }),
    ).toBeVisible();
    await check();
  }
});

test("keyboard access and reflow work on narrow screens", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to conversation" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-workspace")).toBeFocused();
  if (isMobile) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      page.getByRole("textbox", { name: "Search conversations" }),
    ).toBeFocused();
    for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
    expect(
      await page
        .locator(".sidebar")
        .evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toBeFocused();
  }
  await page.setViewportSize({ width: 320, height: 640 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("textbox", { name: "Message Nova" })
    .fill("A small-screen message");
  const send = await page
    .getByRole("button", { name: "Send message", exact: true })
    .boundingBox();
  expect(send?.width).toBeGreaterThanOrEqual(44);
  expect(send?.height).toBeGreaterThanOrEqual(44);
});

test("conversation text, code, and tables remain accessible in both themes", async ({
  page,
}, testInfo) => {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          type: "delta",
          text: "## A useful starting point\n\nBreak the work into three small steps.\n\n1. Define your goal.\n2. Build a small version.\n3. Try it with someone.\n\n```typescript\nconst project = { name: 'A fresh idea', ready: true };\n```\n\n| Stage | Outcome |\n| --- | --- |\n| Plan | A clear brief |\n| Build | Something to try |",
        }) + '\n{"type":"done"}\n',
    }),
  );
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Message Nova" })
    .fill("Help me plan a project");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Regenerate response" }),
  ).toBeVisible();
  await mkdir("test-results", { recursive: true });
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark theme" }).click();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .locator(".conversation-scroll")
      .evaluate((el) => el.scrollTo({ top: 0 }));
    await page.screenshot({
      path: `test-results/conversation-${testInfo.project.name}-${theme}.png`,
      fullPage: true,
    });
  }
});
