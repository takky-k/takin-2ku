import { test, expect } from "@playwright/test";
test("today shows walking minutes, weekly stages and meal quantities offline", async ({
  page,
  context,
}, testInfo) => {
  await page.clock.install({ time: new Date(2026, 10, 16, 12) });
  await page.goto("./");
  const cardio = page.getByRole("region", {
    name: "今日の有酸素",
    exact: true,
  });
  await expect(cardio.getByRole("heading")).toHaveText("早歩き 15分");
  await expect(
    cardio.getByText("筋トレのあとに歩く", { exact: true }),
  ).toBeVisible();
  await cardio.locator("summary").click();
  await expect(cardio.locator(".current-day")).toContainText("月B15分20分");
  const meals = page.locator(".daily-meals");
  await meals.locator("summary").click();
  await expect(meals.getByText(/プロテインシリアル30g/)).toBeVisible();
  await expect(meals.getByText(/鶏むね肉180g/)).toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath(`today-plan-${width}.png`),
      fullPage: true,
    });
  }
  await page.clock.setFixedTime(new Date(2026, 10, 29, 12));
  await page.reload();
  await expect(cardio.getByRole("heading")).toHaveText("早歩き 40分");
  await expect(cardio.getByText(/20分×2回/)).toBeVisible();
  await cardio.locator("summary").click();
  await cardio
    .getByRole("checkbox", { name: "慣らしを続ける", exact: true })
    .check();
  await expect(cardio.getByRole("heading")).toHaveText("早歩き 20分");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(cardio.getByRole("heading")).toHaveText("早歩き 20分");
  await page.clock.setFixedTime(new Date(2026, 11, 4, 12));
  await page.reload();
  await expect(cardio.getByRole("heading")).toHaveText("有酸素は休み");
});
