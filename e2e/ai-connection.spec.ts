import { test, expect } from "@playwright/test";
// WebKit sends service-worker-controlled requests outside page.route(). This
// test mocks all external AI traffic; service workers have their own E2E test.
test.use({ serviceWorkers: "block" });
test("AI setup requires explicit preparation and consent, and logged-out users stay local", async ({
  page,
}) => {
  let configs = 0,
    advice = 0;
  await page.route(
    "https://takin-2ku-ai.tk-tk-tk-20020115.workers.dev/**",
    async (route) => {
      if (route.request().url().endsWith("/config")) {
        configs++;
        await route.fulfill({
          json: {
            projectId: "takin--2ku",
            authDomain: "takin--2ku.firebaseapp.com",
            apiKey: "AIzaSyntheticKeyForLocalBrowserTestsOnly",
          },
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      } else {
        advice++;
        await route.fulfill({
          status: 503,
          json: { error: "owner_setup_required" },
        });
      }
    },
  );
  await page.goto("./");
  await page.getByRole("link", { name: "AI", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "外部AI接続", exact: true }),
  ).toBeVisible();
  expect(configs).toBe(0);
  await expect(
    page.getByRole("button", { name: "Googleでログイン", exact: true }),
  ).toBeDisabled();
  const consent = page.getByRole("checkbox", {
    name: /Cloudflare Workers AIへ送信することに同意する/,
  });
  await expect(consent).not.toBeChecked();
  await page.getByRole("button", { name: "AI接続を準備", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Googleでログイン", exact: true }),
  ).toBeEnabled();
  expect(configs).toBe(1);
  await consent.check();
  await page.getByRole("link", { name: "今日", exact: true }).click();
  await page
    .getByRole("combobox", { name: "今日のメニュー", exact: true })
    .selectOption({ label: "A｜背中・リアデルト・二頭筋" });
  for (const r of await page.getByRole("slider", { name: /の筋肉疲労$/ }).all())
    await r.press("Home");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page).toHaveURL(/#\/workout\/current$/);
  expect(advice).toBe(0);
  await page.getByRole("link", { name: "AI", exact: true }).click();
  await consent.uncheck();
  await page.reload();
  await expect(consent).not.toBeChecked();
  expect(advice).toBe(0);
});
