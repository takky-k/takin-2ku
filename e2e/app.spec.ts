import { test, expect } from "@playwright/test";
test("offline workout, zero/missing RIR, reload, edit/delete and demo isolation", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "今日も、一歩ずつ。" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-dashboard.png",
    fullPage: true,
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.getByRole("button", { name: "開始する", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "トレーニング", exact: true }),
  ).toBeVisible();
  const first = page.getByLabel("セット1のRIR", { exact: true }).first();
  await first.fill("0");
  await first.blur();
  await expect(first).toHaveValue("0");
  await page
    .getByRole("button", { name: "セット1を完了", exact: true })
    .first()
    .click();
  await page.reload();
  await expect(
    page.getByLabel("セット1のRIR", { exact: true }).first(),
  ).toHaveValue("0");
  const second = page.getByLabel("セット2のRIR", { exact: true }).first();
  await second.fill("");
  await second.blur();
  await page.reload();
  await expect(
    page.getByLabel("セット2のRIR", { exact: true }).first(),
  ).toHaveValue("");
  await page.getByLabel("セット1の重量", { exact: true }).first().fill("42.5");
  await page.getByLabel("セット1の重量", { exact: true }).first().blur();
  await page
    .getByRole("button", { name: "セット3を削除", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "削除を確定", exact: true }).click();
  await expect(page.getByLabel("セット3の重量", { exact: true })).toHaveCount(
    2,
  );
  await page
    .getByRole("button", { name: "直前のセット削除を元に戻す", exact: true })
    .click();
  await expect(page.getByLabel("セット3の重量", { exact: true })).toHaveCount(
    3,
  );
  await page
    .getByRole("button", { name: "トレーニングを終了", exact: true })
    .click();
  await page.getByRole("link", { name: "履歴", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /全身ベーシック/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "デモを見る", exact: true }).click();
  await expect(page.getByText("デモ専用データを表示中")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /全身ベーシック/ }),
  ).toHaveCount(6);
  await page
    .getByRole("button", { name: "実データに戻る", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /全身ベーシック/ }),
  ).toHaveCount(1);
  await context.setOffline(false);
});
test("mobile layout, menu editing and local mode without Firebase", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await page.getByRole("button", { name: "作成", exact: true }).click();
  await page.getByLabel("メニュー名", { exact: true }).fill("胸の日");
  await page
    .getByRole("combobox", { name: "種目を追加", exact: true })
    .selectOption({ label: "ベンチプレス / フリーウェイト" });
  await page
    .getByRole("button", { name: "メニューを保存", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "胸の日", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "設定", exact: true }).click();
  await expect(page.getByText("ローカルモード", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("local recommendations require approval before changing a plan", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "開始する", exact: true }).click();
  for (let n = 1; n <= 3; n++) {
    const reps = page.getByLabel(`セット${n}の回数`, { exact: true }).first();
    await reps.fill("12");
    await reps.blur();
    await page
      .getByRole("button", { name: `セット${n}を完了`, exact: true })
      .first()
      .click();
    await expect(
      page
        .getByRole("button", { name: `セット${n}を未完了にする`, exact: true })
        .first(),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "トレーニングを終了", exact: true })
    .click();
  await page.getByRole("link", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "提案を作成", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "承認して反映", exact: true }),
  ).toHaveCount(3);
  await page.getByRole("link", { name: "今日", exact: true }).click();
  await page.getByRole("button", { name: "編集", exact: true }).click();
  await expect(
    page.getByLabel("初期重量 kg", { exact: true }).first(),
  ).toHaveValue("20");
  await page.getByRole("link", { name: "AI", exact: true }).click();
  const bench = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "ベンチプレス", exact: true }),
    });
  await bench
    .getByRole("button", { name: "承認して反映", exact: true })
    .click();
  await expect(bench.getByText("承認済み", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "今日", exact: true }).click();
  await page.getByRole("button", { name: "編集", exact: true }).click();
  await expect(
    page.getByLabel("初期重量 kg", { exact: true }).first(),
  ).toHaveValue("20.5");
});
