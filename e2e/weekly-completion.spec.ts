import { test, expect, type Page } from "@playwright/test";
async function start(page: Page) {
  await page.getByRole("link", { name: "今日", exact: true }).click();
  await page
    .getByRole("combobox", { name: "今日のメニュー", exact: true })
    .selectOption({ label: "A｜背中・リアデルト・二頭筋" });
  for (const s of await page.getByRole("slider", { name: /の筋肉痛$/ }).all())
    await s.press("Home");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".exercise-card")).toHaveCount(4);
  await expect(
    page.getByRole("heading", { name: "ダンベルシュラッグ", exact: true }),
  ).toHaveCount(0);
}
async function finish(page: Page) {
  await page
    .getByRole("button", { name: "トレーニングを終了", exact: true })
    .click();
  await page.getByRole("button", { name: "完了を確定", exact: true }).click();
  await expect(page.locator(".exercise-card")).toHaveCount(0);
}
test("two completions plus one active workout shows two, including a workout resumed from the previous week", async ({
  page,
}) => {
  await page.clock.install({ time: new Date(2026, 10, 8, 12) });
  await page.goto("./");
  await start(page);
  await page.clock.setFixedTime(new Date(2026, 10, 10, 12));
  await finish(page);
  await page.clock.setFixedTime(new Date(2026, 10, 12, 12));
  await start(page);
  await finish(page);
  await page.clock.setFixedTime(new Date(2026, 10, 14, 12));
  await start(page);
  await page.getByRole("link", { name: "分析", exact: true }).click();
  await expect(page.locator(".hero-number")).toHaveText(/2\s*\/\s*4\s*回/);
  await expect(
    page.getByText(/2026-11-09〜2026-11-14.*完了したトレーニングのみ/),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".hero-number")).toHaveText(/2\s*\/\s*4\s*回/);
  await page
    .getByRole("link", { name: "進行中のトレーニングに戻る →", exact: true })
    .click();
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "トレーニングを削除", exact: true })
    .click();
  await expect(page.locator(".exercise-card")).toHaveCount(4);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "トレーニングを削除", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(
    page.getByRole("combobox", { name: "今日のメニュー", exact: true }),
  ).toHaveValue("");
  await page.getByRole("link", { name: "分析", exact: true }).click();
  await expect(page.locator(".hero-number")).toHaveText(/2\s*\/\s*4\s*回/);
  await page
    .getByRole("link", { name: "保存したトレーニング記録を確認", exact: true })
    .click();
  await expect(page.locator(".history-link")).toHaveCount(2);
  await page.getByLabel("日付", { exact: true }).fill("2026-11-10");
  await expect(page.locator(".history-link")).toHaveCount(1);
  await expect(page.locator(".history-link")).toContainText("完了");
});
