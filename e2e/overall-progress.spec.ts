import { test, expect } from "@playwright/test";
test("compact numeric widths and default overall analysis with persisted body goal", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await page
    .getByRole("combobox", { name: "今日のメニュー", exact: true })
    .selectOption({ label: "A｜背中・リアデルト・二頭筋" });
  for (const s of await page.getByRole("slider", { name: /の筋肉疲労$/ }).all())
    await s.press("Home");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page).toHaveURL(/#\/workout\/current$/);
  await expect(
    page.getByText("記録中 · 自動保存", { exact: true }),
  ).toHaveCount(0);
  const card = page.locator(".exercise-card").first(),
    weight = card.getByLabel("セット1の重量", { exact: true }),
    reps = card.getByLabel("セット1の回数", { exact: true }),
    rir = card.getByLabel("セット1のRIR", { exact: true });
  await weight.fill("125");
  await reps.fill("12");
  await rir.fill("1.5~2.5");
  for (const width of [375, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const input of [weight, reps, rir]) {
      const fits = await input.evaluate((el: HTMLInputElement) => {
        const s = getComputedStyle(el),
          c = document.createElement("canvas"),
          ctx = c.getContext("2d")!;
        ctx.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
        return (
          ctx.measureText(el.value).width +
            parseFloat(s.paddingLeft) +
            parseFloat(s.paddingRight) +
            2 <=
          el.getBoundingClientRect().width
        );
      });
      expect(fits).toBe(true);
    }
  }
  await rir.blur();
  await page.getByLabel("体重 (kg)", { exact: true }).fill("160");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("保存しました", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "トレーニングを終了", exact: true })
    .click();
  await page.getByRole("button", { name: "完了を確定", exact: true }).click();
  await page.getByRole("link", { name: "分析", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "種目・器具", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("heading", { name: "全種目の総合推移", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "全種目の総合推移グラフ", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("今週の筋群別セット", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("目標体重 (kg)", { exact: true }).fill("150");
  await page
    .locator(".body-goal")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await expect(
    page.getByRole("progressbar", { name: "目標体重への進捗", exact: true }),
  ).toHaveAttribute("value", "0");
  await page.reload();
  await expect(page.getByLabel("目標体重 (kg)", { exact: true })).toHaveValue(
    "150",
  );
  await page
    .getByRole("combobox", { name: "種目・器具", exact: true })
    .selectOption({ label: "ラットプルダウン / ラットプルダウン" });
  await expect(
    page.getByRole("heading", { name: "種目の推移", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "全種目の総合推移", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("目標体重 (kg)", { exact: true })).toHaveValue(
    "150",
  );
});
