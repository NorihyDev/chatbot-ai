import { test, expect } from "@playwright/test";

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
test("chat, follow-up context, persistence, export, rename, and delete", async ({
  page,
  isMobile,
}) => {
  const requests: unknown[] = [];
  await page.route("**/api/chat", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          type: "delta",
          text: "Here is **real Markdown**.\n\n```typescript\nconst answer = 42;\n```",
        }) + '\n{"type":"done"}\n',
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /What are we/ }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message Nova" })
    .fill("Explain TypeScript");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".markdown strong")).toHaveText("real Markdown");
  await expect(page.getByRole("button", { name: "Copy code" })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message Nova" })
    .fill("Give an example");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".assistant-message")).toHaveCount(2);
  expect(requests[1]).toMatchObject({
    messages: [
      { role: "user", content: "Explain TypeScript" },
      { role: "assistant" },
      { role: "user", content: "Give an example" },
    ],
  });
  await expect(
    page.getByRole("button", { name: "Regenerate response" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export conversation" }).click();
  expect((await download).suggestedFilename()).toBe("nova-conversation.md");
  await page
    .getByRole("button", { name: "Explain TypeScript", exact: true })
    .last()
    .click();
  await page
    .getByRole("textbox", { name: "Conversation title" })
    .fill("My coding notes");
  await page.getByRole("button", { name: "Save title" }).click();
  await page.reload();
  if (isMobile)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "My coding notes", exact: true })
    .click();
  await expect(page.locator(".assistant-message")).toHaveCount(2);
  if (isMobile)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Delete My coding notes" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /What are we/ }),
  ).toBeVisible();
});
test("reports a provider error and retries the same user turn", async ({
  page,
}) => {
  let count = 0;
  await page.route("**/api/chat", (route) => {
    count++;
    return route.fulfill(
      count === 1
        ? { status: 429, json: { error: "Quota reached. Try later." } }
        : {
            contentType: "application/x-ndjson",
            body: '{"type":"delta","text":"Recovered"}\n{"type":"done"}\n',
          },
    );
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Message Nova" }).fill("Hello");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".error-banner")).toContainText("Quota reached");
  await page.getByRole("button", { name: "Retry response" }).click();
  await expect(page.locator(".markdown")).toHaveText("Recovered");
  await expect(page.locator(".user-message")).toHaveCount(1);
});
test("themes persist, suggestions fill the composer, and layout fits", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Write a first draft/ }).click();
  await expect(page.getByRole("textbox", { name: "Message Nova" })).toHaveValue(
    /professional email/,
  );
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator(".app")).toHaveClass(/dark-theme/);
  await page.reload();
  await expect(page.locator(".app")).toHaveClass(/dark-theme/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (isMobile) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      page.getByRole("button", { name: "New conversation" }),
    ).toBeVisible();
  }
});
test("missing key is clearly explained and sending is disabled", async ({
  page,
}) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        authenticated: true,
        passwordConfigured: false,
        ready: false,
        model: "test-model",
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByText("One step to your first reply.")).toBeVisible();
  await page.getByRole("textbox", { name: "Message Nova" }).fill("Hi");
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
});

test("stops an in-flight response and excludes it from follow-up context", async ({
  page,
}) => {
  let calls = 0;
  let followUp: unknown;
  await page.route("**/api/chat", async (route) => {
    calls++;
    if (calls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route
        .fulfill({
          contentType: "application/x-ndjson",
          body: '{"type":"delta","text":"Late reply"}\n{"type":"done"}\n',
        })
        .catch(() => {});
    } else {
      followUp = route.request().postDataJSON();
      await route.fulfill({
        contentType: "application/x-ndjson",
        body: '{"type":"delta","text":"Fresh reply"}\n{"type":"done"}\n',
      });
    }
  });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Message Nova" })
    .fill("First question");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("button", { name: "Stop generating" }).click();
  await expect(
    page.getByText("Response stopped.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message Nova" })
    .fill("Next question");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".markdown")).toHaveText("Fresh reply");
  expect(followUp).toEqual({
    messages: [{ role: "user", content: "Next question" }],
  });
});

test("settings trap keyboard focus and close with Escape", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Nova AI", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Your workspace" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
