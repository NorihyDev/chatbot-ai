import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

// Start npm run dev first. Capture the actual app without provider mocks.
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    colorScheme: "light",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.argv[2] || "http://127.0.0.1:3000", {
    waitUntil: "networkidle",
  });
  await page
    .locator(".setup-notice, .login-screen, .composer")
    .first()
    .waitFor();
  await mkdir("docs", { recursive: true });
  await page.screenshot({ path: "docs/nova-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.screenshot({ path: "docs/nova-mobile.png", fullPage: true });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Saved desktop and mobile previews; no browser runtime errors.");
} finally {
  await browser.close();
}
