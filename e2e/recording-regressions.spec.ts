import { test, expect, type Page } from "@playwright/test";
async function start(page: Page, key: string) {
  await page.getByRole("link", { name: "今日", exact: true }).click();
  await expect(
    page
      .getByRole("combobox", { name: "今日のメニュー", exact: true })
      .locator("option:checked"),
  ).toHaveText(
    key === "A" ? "A｜背中・リアデルト・二頭筋" : "B｜胸・肩・三頭筋",
  );
  await expect(page.getByRole("slider")).toHaveCount(4);
  await expect(page.getByRole("slider", { name: "睡眠時間" })).toHaveAttribute(
    "max",
    "12",
  );
  for (const slider of await page
    .getByRole("slider", { name: /の筋肉痛$/ })
    .all())
    await slider.press("Home");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".exercise-card").first()).toBeVisible();
}
async function finish(page: Page) {
  await page
    .getByRole("button", { name: "トレーニングを終了", exact: true })
    .click();
  await page.getByRole("button", { name: "完了を確定", exact: true }).click();
  await expect(page.locator(".exercise-card")).toHaveCount(0);
}
test("A/B previous results, three weekly completions, fixed timer and collapsible exercises", async ({
  page,
}) => {
  await page.clock.install({ time: new Date(2026, 10, 9, 12) });
  await page.goto("./");
  for (const [day, key] of [
    [9, "A"],
    [10, "B"],
    [12, "A"],
    [13, "B"],
  ] as const) {
    await page.clock.setFixedTime(new Date(2026, 10, day, 12));
    await start(page, key);
    const card = page.locator(".exercise-card").first();
    const rir = card.getByLabel("セット1のRIR", { exact: true });
    await expect(rir).toHaveValue("");
    await expect(rir).toHaveAttribute("placeholder", "任意");
    if (day >= 12)
      await expect(card.locator(".previous-cell").first()).toContainText("lb");
    await card.locator(":scope > summary").click();
    await expect(card.getByRole("table").first()).not.toBeVisible();
    await card.locator(":scope > summary").click();
    await expect(card.getByRole("table").first()).toBeVisible();
    const timer = page.locator(".timer");
    await expect(timer).toHaveCSS("position", "fixed");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(timer).toBeInViewport();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(timer).toBeInViewport();
    const buttons = page.locator(".workout-finish-actions button");
    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBeLessThanOrEqual(44);
      expect(
        await button.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
    if (day < 13) await finish(page);
  }
  await page.getByRole("link", { name: "分析", exact: true }).click();
  await expect(page.locator(".hero-number")).toHaveText(/3\s*\/\s*4\s*回/);
  await expect(page.getByText(/2026-11-09〜2026-11-13/)).toBeVisible();
});
test("unfinished past workout stays separate and can be completed on its original day", async ({
  page,
}) => {
  await page.clock.install({ time: new Date(2026, 10, 10, 12) });
  await page.goto("./");
  await start(page, "A");
  await page.clock.setFixedTime(new Date(2026, 10, 14, 12));
  await start(page, "A");
  await finish(page);
  await page.getByRole("link", { name: "分析", exact: true }).click();
  await expect(page.locator(".hero-number")).toHaveText(/1\s*\/\s*4\s*回/);
  await page
    .getByRole("link", { name: "途中の記録を確認", exact: true })
    .click();
  await expect(page.locator(".history-link")).toHaveCount(2);
  await page.locator(".history-link").filter({ hasText: "途中" }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", {
      name: "2026-11-10の記録を完了として保存",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "2026-11-10の記録を完了として保存",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "分析", exact: true }).click();
  await expect(page.locator(".hero-number")).toHaveText(/2\s*\/\s*4\s*回/);
});
