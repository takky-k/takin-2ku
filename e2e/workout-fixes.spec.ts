import { test, expect, type Page } from "@playwright/test";
async function start(page: Page) {
  await page.getByRole("link", { name: "今日", exact: true }).click();
  await page
    .getByRole("combobox", { name: "今日のメニュー", exact: true })
    .selectOption({ label: "A｜背中・リアデルト・二頭筋" });
  for (const s of await page.getByRole("slider", { name: /の筋肉疲労$/ }).all())
    await s.press("Home");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".exercise-card").first()).toBeVisible();
}
test("kg body weight, collapsed picker, red expiry flash and navigation survive saving", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-01T20:00:00Z") });
  await page.goto("./");
  await start(page);
  await expect(
    page.getByRole("columnheader", { name: "重量 (lb)" }).first(),
  ).toBeVisible();
  const weight = page.locator(".post-workout-weight"),
    picker = page.locator(".exercise-picker"),
    timer = page.locator(".timer");
  expect(
    await weight.evaluate(
      (el) =>
        !!(
          el.compareDocumentPosition(
            document.querySelector(".exercise-picker")!,
          ) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
    ),
  ).toBe(true);
  expect(
    await picker.evaluate(
      (el) =>
        !!(
          el.compareDocumentPosition(document.querySelector(".timer")!) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
    ),
  ).toBe(true);
  await expect(picker).not.toHaveAttribute("open", "");
  await expect(picker.getByRole("combobox")).not.toBeVisible();
  await picker.locator("summary").click();
  await expect(picker.getByRole("combobox")).toBeVisible();
  await picker.locator("summary").click();
  await page.getByRole("button", { name: "30秒", exact: true }).click();
  await page.clock.fastForward(30000);
  const flash = page.locator(".timer-finished-flash");
  await expect(flash).toHaveCount(1);
  await expect(flash).toHaveCSS("background-color", "rgb(255, 0, 0)");
  await expect(flash).toHaveCSS("pointer-events", "none");
  await page.clock.fastForward(1000);
  await expect(flash).toHaveCount(0);
  await page.getByRole("button", { name: "30秒", exact: true }).click();
  await page.getByRole("button", { name: "タイマー停止", exact: true }).click();
  await page.clock.fastForward(31000);
  await expect(flash).toHaveCount(0);
  await page.getByLabel("体重 (kg)", { exact: true }).fill("70");
  await weight.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  await page
    .getByRole("button", { name: "トレーニングを終了", exact: true })
    .click();
  await page.getByRole("button", { name: "完了を確定", exact: true }).click();
  await expect(page.locator(".exercise-card")).toHaveCount(0);
  await expect(page.getByRole("navigation")).toBeVisible();
  for (const name of ["分析", "記録", "AI", "今日"]) {
    await page
      .getByRole("navigation")
      .getByRole("link", { name, exact: true })
      .click();
    await expect(page.getByRole("navigation")).toBeVisible();
  }
  await page.getByRole("link", { name: "分析", exact: true }).click();
  await page.getByLabel("目標体重 (kg)").fill("65");
  await page
    .locator(".body-goal")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await expect(page.locator(".body-goal .progress-value")).toContainText(
    "65kg",
  );
  await page.reload();
  await expect(page.getByLabel("目標体重 (kg)")).toHaveValue("65");
});

test("old records, high-rep results and foreground refresh remain visible in analysis and history", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-01T20:00:00Z") });
  await page.goto("./");
  await start(page);
  await page
    .getByRole("button", { name: "トレーニングを終了", exact: true })
    .click();
  await page.getByRole("button", { name: "完了を確定", exact: true }).click();
  await expect(page.locator(".exercise-card")).toHaveCount(0);
  await page.clock.setFixedTime(new Date("2026-11-14T20:00:00Z"));
  await page.getByRole("link", { name: "分析", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "期間", exact: true }),
  ).toHaveValue("0");
  await expect(
    page.getByRole("img", { name: "全種目の総合推移グラフ", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "種目・器具", exact: true })
    .selectOption({ label: "ダンベルシュラッグ / ダンベル" });
  await expect(
    page.getByRole("status").filter({ hasText: "記録は保存されています" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "指標", exact: true })
    .selectOption("reps");
  await expect(page.getByText(/直近：15 回/)).toBeVisible();
  await page
    .getByRole("combobox", { name: "種目・器具", exact: true })
    .selectOption({ label: "ラットプルダウン / ラットプルダウン" });
  await page
    .getByRole("combobox", { name: "指標", exact: true })
    .selectOption("weight");
  // Native IndexedDB writes simulate a change whose Dexie broadcast was missed
  // while iOS suspended the page. A pageshow must explicitly reread the DB.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("takin-2ku");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sets", "readwrite"),
        store = tx.objectStore("sets");
      const request = store.getAll();
      request.onsuccess = () => {
        for (const row of request.result) {
          row.weightKg = 80;
          store.put(row);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    window.dispatchEvent(new Event("pageshow"));
  });
  await expect(page.getByText(/直近：176\.37 lb/)).toBeVisible();
  await page
    .getByRole("combobox", { name: "期間", exact: true })
    .selectOption("28");
  await expect(
    page.getByText("グラフを表示する記録がありません。", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "期間", exact: true })
    .selectOption("0");
  await expect(page.getByText(/直近：176\.37 lb/)).toBeVisible();
  await page
    .getByRole("link", { name: "保存したトレーニング記録を確認" })
    .click();
  await expect(page.locator(".history-link")).toHaveCount(1);
  await expect(page.locator(".history-link")).toContainText("13セット完了");
});
