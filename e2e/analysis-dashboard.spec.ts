import { test, expect, type Page } from "@playwright/test";
async function workout(page: Page, day: number, weight?: string) {
  await page.clock.setFixedTime(new Date(2026, 10, day, 12));
  await page.getByRole("link", { name: "今日", exact: true }).click();
  await expect(page.getByRole("slider", { name: /の筋肉痛$/ })).toHaveCount(2);
  for (const slider of await page
    .getByRole("slider", { name: /の筋肉痛$/ })
    .all())
    await slider.press("Home");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".exercise-card").first()).toBeVisible();
  if (weight) {
    await page
      .locator(".exercise-card")
      .first()
      .getByLabel("セット1の重量", { exact: true })
      .fill(weight);
    await page
      .locator(".exercise-card")
      .first()
      .getByLabel("セット1の重量", { exact: true })
      .blur();
  }
  await page.getByLabel("体重 (kg)", { exact: true }).fill("70");
  await page
    .getByRole("button", { name: "トレーニングを終了", exact: true })
    .click();
  await page.getByRole("button", { name: "完了を確定", exact: true }).click();
  await expect(page.locator(".exercise-card")).toHaveCount(0);
}
test("clear achievement stats, real personal best, chart marks and history on mobile and desktop", async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date(2026, 10, 9, 12) });
  await page.goto("./");
  await expect(page.getByText(/0.5時間刻み。|他の部位は、/)).toHaveCount(0);
  await workout(page, 9);
  await workout(page, 10);
  await workout(page, 12, "105");
  await page.getByRole("link", { name: "分析", exact: true }).click();
  await expect(page.locator(".hero-number")).toHaveText(/3\s*\/\s*4\s*回/);
  await expect(
    page.locator(".training-stat").filter({ hasText: "今週のセット" }),
  ).toContainText("36セット");
  await expect(
    page.locator(".training-stat").filter({ hasText: "累計トレーニング" }),
  ).toContainText("3回");
  await expect(page.locator(".record-badge")).toHaveText("直近で1種目更新");
  await expect(page.locator(".best-row").first()).toContainText("105lb");
  await expect(page.locator(".training-days .trained")).toHaveCount(3);
  await expect(
    page.locator(".training-analysis .hint,.training-analysis .notice"),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      /SMALL STEPS|完了したトレーニングのみ|回復・個人予測|総合指数/,
    ),
  ).toHaveCount(0);
  await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
  const history = page.getByRole("link", {
    name: "保存したトレーニング記録を確認",
    exact: true,
  });
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath(`analysis-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.screenshot({
    path: testInfo.outputPath("analysis-light.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await page
    .getByRole("combobox", { name: "種目・器具", exact: true })
    .selectOption({ label: "ラットプルダウン / ラットプルダウン" });
  await expect(page.locator(".trend-current strong")).toHaveText("105lb");
  await expect(
    page.locator(".analysis-trend .recharts-line-curve"),
  ).toBeVisible();
  await history.click();
  await expect(page.locator(".history-link")).toHaveCount(3);
});
