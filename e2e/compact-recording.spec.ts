import { test, expect, type Page } from "@playwright/test";
async function start(page: Page) {
  await page.getByRole("link", { name: "今日", exact: true }).click();
  await page
    .getByRole("combobox", { name: "今日のメニュー", exact: true })
    .selectOption({ label: "A｜背中・リアデルト・二頭筋" });
  for (const s of await page.getByRole("slider", { name: /の筋肉疲労$/ }).all())
    await s.press("Home");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page).toHaveURL(/#\/workout\/current$/);
  await expect(page.locator(".exercise-card").first()).toBeVisible();
}
async function finish(page: Page) {
  await page
    .getByRole("button", { name: "トレーニングを終了", exact: true })
    .click();
  await page.getByRole("button", { name: "完了を確定", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "トレーニング完了の確認" }),
  ).toHaveCount(0);
}
test("compact tables, collapsed memos, default reps, running hidden timer and session-only skip", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-07T20:00:00Z") });
  await page.goto("./");
  await start(page);
  let card = page.locator(".exercise-card").first();
  await expect(page.locator(".session-memo")).not.toHaveAttribute("open", "");
  await expect(card.locator(".evergreen-notes")).not.toHaveAttribute(
    "open",
    "",
  );
  await card.locator(".evergreen-notes summary").click();
  await expect(card.getByText(/胸にバーを付ける必要はない/)).toBeVisible();
  await card.locator(".evergreen-notes summary").click();
  await expect(
    page.getByRole("link", { name: /開始前の提案を確認/ }),
  ).toHaveCount(0);
  await expect(card.getByRole("button", { name: /を上へ|を下へ/ })).toHaveCount(
    0,
  );
  await expect(card.getByText("ラットプルダウン", { exact: true })).toHaveCount(
    1,
  );
  await expect(card.getByText("セット1のメモ", { exact: true })).toHaveCount(0);
  await expect(card.getByRole("columnheader")).toHaveCount(6);
  await expect(card.getByRole("columnheader").nth(1)).toHaveText("前回");
  const reps = card.getByLabel("セット1の回数", { exact: true });
  await expect(reps).toHaveValue("");
  await expect(reps).toHaveAttribute("placeholder", "8");
  await reps.fill("15");
  await reps.fill("");
  await reps.blur();
  await page.reload();
  await expect(reps).toHaveValue("");
  await expect(reps).toHaveAttribute("placeholder", "8");
  await page.getByRole("button", { name: "1分", exact: true }).click();
  const input = card.getByLabel("セット1のRIR", { exact: true });
  await input.fill("0");
  await expect(page.getByRole("navigation")).not.toBeVisible();
  await expect(page.locator(".timer")).not.toBeVisible();
  await page.clock.fastForward(15000);
  await expect(page.locator(".timer b")).toHaveText("45秒");
  await expect(card.getByLabel("セット1の回数", { exact: true })).toHaveValue(
    "",
  );
  await input.blur();
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.locator(".timer")).toBeVisible();
  await expect(page.locator(".timer b")).toHaveText("45秒");
  const controls = card.locator(".exercise-actions button"),
    add = await controls.first().boundingBox(),
    skip = await controls.last().boundingBox();
  expect(add?.height).toBe(skip?.height);
  expect(skip!.x).toBeGreaterThan(add!.x + add!.width);
  expect(add!.height).toBeLessThan(46);
  const weight = page.getByRole("heading", {
      name: "トレーニング後の体重",
      exact: true,
    }),
    end = page.getByRole("heading", {
      name: "今回のトレーニングを終了",
      exact: true,
    });
  expect((await weight.boundingBox())!.y).toBeLessThan(
    (await end.boundingBox())!.y,
  );
  await page.getByLabel("体重 (lb)", { exact: true }).fill("160");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("保存しました", { exact: true })).toBeVisible();
  await finish(page);
  await start(page);
  card = page.locator(".exercise-card").first();
  await expect(card.locator(".previous-cell").first()).toContainText("100lb");
  await expect(card.locator(".previous-cell").first()).toContainText("8回");
  page.once("dialog", (d) => d.accept());
  await card
    .getByRole("button", {
      name: "ラットプルダウンを今回だけ見送る",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "ラットプルダウン", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "記録", exact: true }).click();
  await expect(page.locator(".menu-card").first()).toContainText(
    "ラットプルダウン",
  );
  await expect(page.locator(".menu-card").first()).toContainText("5種目");
  await expect(page.locator(".menu-card").first()).toContainText("13セット");
});
