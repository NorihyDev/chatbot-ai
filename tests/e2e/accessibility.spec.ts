import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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
