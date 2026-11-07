import { test, expect, type Page } from "@playwright/test";
const planA = (page: Page) =>
  page
    .locator("section.card")
    .filter({
      has: page.getByRole("heading", {
        name: "A｜背中・リアデルト・二頭筋",
        exact: true,
      }),
    });
async function startA(page: Page) {
  await page.getByRole("link", { name: "今日", exact: true }).click();
  await planA(page)
    .getByRole("button", { name: "開始する", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "トレーニング", exact: true }),
  ).toBeVisible();
}
async function finish(page: Page) {
  await page
    .getByRole("button", { name: "トレーニングを終了", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "トレーニング完了の確認" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "完了を確定", exact: true }).click();
}
test("offline actual RIR, autosave, undo, notes and demo isolation", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await expect(planA(page)).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-dashboard.png",
    fullPage: true,
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await startA(page);
  const card = page.locator("section.exercise-card").first();
  await expect(card.getByLabel("セット1の重量", { exact: true })).toHaveValue(
    "100",
  );
  await expect(card.getByLabel("セット1のRIR", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    card.getByRole("complementary", {
      name: "ラットプルダウンの永続フォームメモ",
    }),
  ).toBeVisible();
  await expect(card.getByText(/胸にバーを付ける必要はない/)).toBeVisible();
  await card.getByLabel("セット1のRIR", { exact: true }).fill("0");
  await card.getByLabel("セット1のRIR", { exact: true }).blur();
  await card
    .getByRole("button", { name: "セット1を完了", exact: true })
    .click();
  await card.getByRole("button", { name: "入力欄で編集", exact: true }).click();
  await page.reload();
  await expect(
    page
      .locator("section.exercise-card")
      .first()
      .getByLabel("セット1のRIR", { exact: true }),
  ).toHaveValue("0");
  await card
    .getByRole("button", { name: "セット2を完了", exact: true })
    .click();
  await card
    .getByRole("button", { name: "未入力で続ける", exact: true })
    .click();
  await page.reload();
  await expect(card.getByLabel("セット2のRIR", { exact: true })).toHaveValue(
    "",
  );
  await card.getByLabel("セット3の重量", { exact: true }).fill("85");
  await card.getByLabel("セット3の重量", { exact: true }).blur();
  await page.reload();
  await expect(card.getByLabel("セット3の重量", { exact: true })).toHaveValue(
    "85",
  );
  await card
    .getByRole("button", { name: "セット3を削除", exact: true })
    .click();
  await card.getByRole("button", { name: "削除を確定", exact: true }).click();
  await expect(card.getByLabel("セット3の重量", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "直前のセット削除を元に戻す" })
    .click();
  await expect(card.getByLabel("セット3の重量", { exact: true })).toHaveValue(
    "85",
  );
  await card.getByLabel("セット3のRIR", { exact: true }).fill("1〜2");
  await card.getByLabel("セット3のRIR", { exact: true }).blur();
  await page.screenshot({ path: "test-results/mobile-workout.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await finish(page);
  await page.getByRole("link", { name: "履歴", exact: true }).click();
  await expect(page.getByRole("button", { name: /A｜/ })).toHaveCount(1);
  await page.getByRole("button", { name: "デモを見る", exact: true }).click();
  await expect(page.getByText("デモ専用データを表示中")).toBeVisible();
  await expect(page.getByRole("button", { name: /[AB]｜/ })).toHaveCount(6);
  await page
    .getByRole("button", { name: "実データに戻る", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /A｜/ })).toHaveCount(1);
  await context.setOffline(false);
});
test("menu editing, monochrome mobile navigation, optional wellness and settings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await page.getByRole("button", { name: "作成", exact: true }).click();
  await page.getByLabel("メニュー名", { exact: true }).fill("カスタム上半身");
  await page
    .getByRole("combobox", { name: "種目を追加", exact: true })
    .selectOption({ label: "ラットプルダウン / ラットプルダウン" });
  await page.getByLabel("予定1-1の重量", { exact: true }).fill("75");
  await page
    .getByRole("button", { name: "メニューを保存", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "カスタム上半身" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "チェックイン", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "気分", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "疲労", exact: true }),
  ).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "睡眠時間" })).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation")
      .getByRole("link", { name: "記録", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation")
      .getByRole("link", { name: "設定", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "設定", exact: true }).click();
  await expect(page.getByText("ローカルモード", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("approval changes only this session, template and actual RIR stay intact", async ({
  page,
}) => {
  await page.goto("./");
  await startA(page);
  const card = page.locator("section.exercise-card").first();
  for (let n = 1; n <= 3; n++) {
    await card.getByLabel(`セット${n}のRIR`, { exact: true }).fill("2");
    await card.getByLabel(`セット${n}のRIR`, { exact: true }).blur();
    await card
      .getByRole("button", { name: `セット${n}を完了`, exact: true })
      .click();
    await card
      .getByRole("button", { name: "入力欄で編集", exact: true })
      .click();
  }
  await finish(page);
  await startA(page);
  await expect(card.getByLabel("セット1のRIR", { exact: true })).toHaveValue(
    "",
  );
  await expect(card.getByLabel("セット1の回数", { exact: true })).toHaveValue(
    "8",
  );
  await page.getByRole("link", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "提案を作成", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "承認して今回に反映", exact: true }),
  ).toHaveCount(5);
  await page.getByRole("link", { name: "記録", exact: true }).click();
  await expect(card.getByLabel("セット1の回数", { exact: true })).toHaveValue(
    "8",
  );
  await page.getByRole("link", { name: "AI", exact: true }).click();
  const lat = page
    .locator("section.card")
    .filter({
      has: page.getByRole("heading", { name: "ラットプルダウン", exact: true }),
    });
  await lat
    .getByRole("button", { name: "承認して今回に反映", exact: true })
    .click();
  await expect(lat.getByText("承認済み", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "記録", exact: true }).click();
  await expect(card.getByLabel("セット1の回数", { exact: true })).toHaveValue(
    "9",
  );
  await expect(card.getByLabel("セット1のRIR", { exact: true })).toHaveValue(
    "",
  );
  await page.getByRole("link", { name: "今日", exact: true }).click();
  await planA(page).getByRole("button", { name: "編集", exact: true }).click();
  await expect(page.getByLabel("予定1-1の回数", { exact: true })).toHaveValue(
    "8",
  );
});
test("CSV is previewed, quarantined, deduplicated and never remotely uploaded", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:4173/")) requests.push(r.url());
  });
  await page.goto("./");
  await page.getByRole("link", { name: "設定", exact: true }).click();
  const content =
    "日付,種目,セット番号,重量,重量単位,回数,RIR,メモ,データ区分,確認状況\n2026-07-01,合成テスト,1,10,lb,8,0,テスト,実績として記載,過去記録から確認\n2026-07-01,合成テスト,2,10,lb,限界,12,テスト,実績として記載,過去記録から確認";
  const upload = async () => {
    await page
      .getByLabel("履歴CSVファイル", { exact: true })
      .setInputFiles({
        name: "synthetic.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(content),
      });
    await expect(
      page.getByRole("heading", { name: "取り込みプレビュー" }),
    ).toBeVisible();
  };
  await upload();
  await expect(page.getByText(/実績候補 1行/)).toBeVisible();
  await page
    .getByRole("button", { name: "確認して取り込む", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "実績 1件 / 原文のみ保留 1件" }),
  ).toBeVisible();
  await upload();
  await page
    .getByRole("button", { name: "確認して取り込む", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "重複 2件" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "履歴", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /CSVのトレーニング履歴/ }),
  ).toHaveCount(1);
  expect(requests).toEqual([]);
});
