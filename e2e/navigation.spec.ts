import { test, expect } from "@playwright/test";
import { gzipSync } from "node:zlib";
test("private import counts once in analysis, and start targets use history and the saved menu-specific condition directly", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-07T20:00:00Z"));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "今日のコンディション", level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "マイメニュー", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("今週のトレーニング", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("navigation").getByRole("link")).toHaveCount(4);
  await expect(
    page
      .getByRole("navigation")
      .getByRole("link", { name: "履歴", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "今日のメニュー", exact: true })
    .selectOption({ label: "B｜胸・肩・三頭筋" });
  for (const slider of await page
    .getByRole("slider", { name: /の筋肉疲労$/ })
    .all())
    await slider.press("End");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("保存しました", { exact: true })).toBeVisible();
  const names = [
    "新チェストプレスマシン",
    "インクラインチェストプレスマシン",
    "ペックデック",
    "ダンベルサイドレイズ",
    "トリセップマシン",
  ];
  const payload = {
    app: "takin-2ku-workout",
    schemaVersion: 1,
    importId: "synthetic-weekly-code",
    dateLocal: "2026-11-06",
    name: "合成データ",
    unit: "lb",
    exercises: names.map((exerciseName, index) => ({
      exerciseName,
      sets: Array.from({ length: index < 2 ? 3 : 2 }, () => ({
        weight: 20,
        reps: 6,
        rir: { min: 1, max: 2 },
        notes: "",
      })),
    })),
  };
  const code =
    "t2w1." + gzipSync(JSON.stringify(payload)).toString("base64url");
  const upload = async () => {
    await page.getByRole("link", { name: "設定", exact: true }).click();
    await page
      .getByRole("textbox", { name: "取込コードまたはJSON", exact: true })
      .fill(code);
    await page.getByRole("button", { name: "内容を確認", exact: true }).click();
    await expect(page.getByText(/5種目 · 12セット/)).toBeVisible();
    await page
      .getByRole("button", { name: "確認して実績を保存", exact: true })
      .click();
  };
  await upload();
  await expect(
    page.getByText("取り込み完了：追加12セット、RIR修正0セット", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "分析", exact: true }).click();
  await expect(page.locator("main section").first()).toHaveAttribute(
    "aria-label",
    "今週のトレーニング",
  );
  await expect(page.locator(".hero-number")).toHaveText(/1\s*\/\s*4\s*回/);
  await expect(
    page
      .getByRole("combobox", { name: "種目・器具", exact: true })
      .locator("option:checked"),
  ).toContainText("全種目（総合）");
  await expect(
    page.getByText("グラフを表示する記録がありません。", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "目標への積み重ね", exact: true }),
  ).toHaveCount(0);
  await upload();
  await expect(
    page.getByText("取込済みです。重複登録しません。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "記録", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "マイメニュー", exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole("heading", { name: "今日のメニューを選ぶ", exact: true }),
  ).toHaveCount(0);
  const b = page.locator(".menu-card").filter({
    has: page.getByRole("heading", {
      name: "B｜胸・肩・三頭筋",
      exact: true,
    }),
  });
  await b.getByRole("button", { name: "開始する", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "今日の目標を確認", exact: true }),
  ).toHaveCount(0);
  const first = page.locator(".exercise-card").first();
  await expect(first.getByLabel("セット1の重量", { exact: true })).toHaveValue(
    "20",
  );
  await expect(
    first.getByLabel("セット1の回数", { exact: true }),
  ).toHaveAttribute("placeholder", "6");
  await expect(first.getByLabel("セット1の回数", { exact: true })).toHaveValue(
    "",
  );
  await expect(first.getByLabel("セット1のRIR", { exact: true })).toHaveValue(
    "",
  );
  await page.reload();
  await expect(first.getByLabel("セット1の重量", { exact: true })).toHaveValue(
    "20",
  );
  await page.getByRole("link", { name: "分析", exact: true }).click();
  await expect(page.locator(".hero-number")).toHaveText(/1\s*\/\s*4\s*回/);
});
