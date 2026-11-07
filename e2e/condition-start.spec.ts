import { test, expect, type Page } from "@playwright/test";
const card = (p: Page, key: string) =>
  p.locator(".menu-card").filter({
    has: p.getByRole("heading", {
      name: key === "A" ? "A｜背中・リアデルト・二頭筋" : "B｜胸・肩・三頭筋",
      exact: true,
    }),
  });
async function saveCondition(page: Page, key: string) {
  await expect(
    page
      .getByRole("combobox", { name: "今日のメニュー", exact: true })
      .locator("option:checked"),
  ).toHaveText(
    key === "A" ? "A｜背中・リアデルト・二頭筋" : "B｜胸・肩・三頭筋",
  );
  for (const slider of await page
    .getByRole("slider", { name: /の筋肉疲労$/ })
    .all())
    await slider.press("Home");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page).toHaveURL(/#\/workout\/current$/);
}
test("record tab always opens menu picker and preserves both drafts while requiring the right condition", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("link", { name: "記録", exact: true }).click();
  await card(page, "A")
    .getByRole("button", { name: "開始する", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/\?plan=/);
  await expect(page.getByRole("alert")).toContainText("筋肉疲労");
  await expect(
    page.getByRole("slider", { name: "胸の筋肉疲労", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("slider", { name: "背中の筋肉疲労", exact: true }),
  ).toBeVisible();
  await saveCondition(page, "A");
  await expect(page).toHaveURL(/#\/workout\/current$/);
  await expect(
    page.getByRole("heading", { name: "今日の目標を確認", exact: true }),
  ).toHaveCount(0);
  const a = page.locator(".exercise-card").first();
  await a.getByLabel("セット1の重量", { exact: true }).fill("82");
  await a.getByLabel("セット1の回数", { exact: true }).fill("7");
  await a.getByLabel("セット1のRIR", { exact: true }).fill("1~2");
  await a.getByLabel("セット1のRIR", { exact: true }).blur();
  await page.getByRole("link", { name: "記録", exact: true }).click();
  await expect(page).toHaveURL(/#\/workout$/);
  await expect(
    page.getByRole("heading", { name: "マイメニュー", exact: true }),
  ).toBeInViewport();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(
    card(page, "A").getByRole("button", { name: "続きから記録", exact: true }),
  ).toBeVisible();
  await card(page, "B")
    .getByRole("button", { name: "開始する", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/\?plan=/);
  await expect(
    page.getByRole("slider", { name: "背中の筋肉疲労", exact: true }),
  ).toHaveCount(0);
  await saveCondition(page, "B");
  await expect(
    page
      .locator(".exercise-card")
      .first()
      .getByRole("heading", { name: "新チェストプレスマシン", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "記録", exact: true }).click();
  await card(page, "A")
    .getByRole("button", { name: "続きから記録", exact: true })
    .click();
  await saveCondition(page, "A");
  await expect(a.getByLabel("セット1の重量", { exact: true })).toHaveValue(
    "82",
  );
  await expect(a.getByLabel("セット1の回数", { exact: true })).toHaveValue("7");
  await expect(a.getByLabel("セット1のRIR", { exact: true })).toHaveValue(
    "1~2",
  );
  await page.reload();
  await expect(a.getByLabel("セット1の重量", { exact: true })).toHaveValue(
    "82",
  );
  const status = await page.locator("header .status").evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      font: parseFloat(style.fontSize),
      height: el.getBoundingClientRect().height,
      line: parseFloat(style.lineHeight),
    };
  });
  expect(status.font).toBeLessThanOrEqual(9);
  expect(status.height).toBeLessThanOrEqual(status.line + 1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("saving incomplete condition stays on today and a valid saved B starts directly offline", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".save-status")).toContainText(
    "コンディションは保存済みです",
  );
  await expect(
    page.getByRole("heading", { name: "今日のコンディション", level: 2 }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "今日のメニュー", exact: true })
    .selectOption({ label: "B｜胸・肩・三頭筋" });
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".save-status")).toContainText("筋肉疲労");
  for (const slider of await page
    .getByRole("slider", { name: /の筋肉疲労$/ })
    .all())
    await slider.press("Home");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page).toHaveURL(/#\/workout\/current$/);
  await expect(page.locator(".session-heading")).toContainText(
    "B｜胸・肩・三頭筋",
  );
  await expect(
    page
      .locator(".exercise-card")
      .first()
      .getByRole("heading", { name: "新チェストプレスマシン", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "今日", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "胸の筋肉疲労", exact: true }),
  ).toHaveValue("1");
});
