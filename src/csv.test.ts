import { it, expect, afterEach } from "vitest";
import { AppDB, exportBackup, save, revised } from "./db";
import {
  csvColumns,
  prepareCsv,
  importCsv,
  readCsv,
  rollbackCsv,
  confirmReviewRow,
} from "./csv";
const opened: AppDB[] = [];
const fresh = () => {
  const db = new AppDB("csv-" + crypto.randomUUID());
  opened.push(db);
  return db;
};
afterEach(async () => {
  for (const d of opened.splice(0)) await d.delete();
});
const row = (patch: Record<string, string> = {}) => ({
  日付: "2026-07-01",
  種目: "テスト種目",
  セット番号: "1",
  重量: "10",
  重量単位: "lb",
  回数: "8",
  RIR: "",
  メモ: "合成テスト",
  データ区分: "実績として記載",
  確認状況: "過去記録から確認",
  ...patch,
});
const csv = (rows: Record<string, string>[]) =>
  [
    csvColumns.join(","),
    ...rows.map((r) =>
      csvColumns.map((c) => '"' + r[c].replaceAll('"', '""') + '"').join(","),
    ),
  ].join("\r\n");
it("reads BOM, quotes, escaped quotes and embedded newlines", () => {
  expect(readCsv('\ufeffa,b\r\n"a,""b""","line1\nline2"')).toEqual([
    ["a", "b"],
    ['a,"b"', "line1\nline2"],
  ]);
  expect(() => readCsv('a\n"unterminated')).toThrow();
});
it("preserves zero, missing and range RIR, quarantines ambiguous raw values", async () => {
  const p = await prepareCsv(
    csv([
      row({ RIR: "0" }),
      row({ セット番号: "2", RIR: "" }),
      row({ セット番号: "3", RIR: "1-2" }),
      row({ セット番号: "4", RIR: "12" }),
      row({ セット番号: "5", 回数: "12-13" }),
      row({ セット番号: "6", 重量: "30-35", 回数: "" }),
    ]),
    "synthetic.csv",
  );
  expect(p.rows.map((r) => r.eligible)).toEqual([
    true,
    true,
    true,
    false,
    false,
    false,
  ]);
  const d = fresh();
  const r = await importCsv(d, p);
  expect(r.imported).toBe(3);
  expect(r.review).toBe(3);
  const sets = await d.sets.toArray();
  expect(sets.find((s) => s.ordinal === 0)?.rir).toEqual({ min: 0, max: 0 });
  expect(sets.find((s) => s.ordinal === 1)?.rir).toBeNull();
  expect(sets.find((s) => s.ordinal === 2)?.rir).toEqual({ min: 1, max: 2 });
  expect(sets[0].inputUnit).toBe("lb");
  expect(sets[0].loadMode).toBe("unknown");
  expect(
    (await d.importRows.toArray()).some((r) => r.raw["RIR"] === "12"),
  ).toBe(true);
  expect((await d.sessions.toArray())[0].timePrecision).toBe("date");
});
it("does not turn planned template values into actuals unless explicitly confirmed", async () => {
  const p = await prepareCsv(
    csv([
      row({
        日付: "2026-10-13",
        種目: "ラットプルダウン",
        重量: "100",
        回数: "8",
      }),
    ]),
    "synthetic.csv",
  );
  expect(p.rows[0].eligible).toBe(false);
  const d = fresh();
  expect((await importCsv(d, p)).imported).toBe(0);
  await confirmReviewRow(d, p.rows[0].id);
  expect(await d.sets.count()).toBe(1);
  expect((await d.importRows.get(p.rows[0].id))?.raw).toEqual(p.rows[0].raw);
  const e = fresh();
  expect((await importCsv(e, p, new Set([p.rows[0].id]))).imported).toBe(1);
});
it("deduplicates across files and detects content conflicts without overwrite", async () => {
  const d = fresh(),
    p = await prepareCsv(csv([row(), row()]), "one.csv");
  expect((await importCsv(d, p)).duplicates).toBe(1);
  const second = await prepareCsv(csv([row()]), "renamed.csv");
  expect((await importCsv(d, second)).duplicates).toBe(1);
  const changed = await prepareCsv(csv([row({ 重量: "20" })]), "changed.csv");
  expect((await importCsv(d, changed)).conflicts).toBe(1);
  expect(await d.sets.count()).toBe(1);
  expect((await d.sets.toArray())[0].inputWeight).toBe(10);
});
it("rolls back a whole failed transaction and preserves original data on a late edit", async () => {
  const d = fresh(),
    p = await prepareCsv(csv([row()]), "one.csv");
  const hook = () => {
    throw Error("synthetic storage failure");
  };
  d.queue.hook("creating", hook);
  await expect(importCsv(d, p)).rejects.toThrow();
  expect(await d.sets.count()).toBe(0);
  expect(await d.importRows.count()).toBe(0);
  d.queue.hook("creating").unsubscribe(hook);
  const r = await importCsv(d, p);
  const saved = (await d.sets.toArray())[0];
  await save(d, "sets", revised({ ...saved, reps: 9 }));
  await expect(rollbackCsv(d, r.batchId)).rejects.toThrow("編集");
  expect((await d.importRows.toArray())[0].deletedAt).toBeNull();
});
it("rolls back an unedited batch using tombstones and backs up raw review rows", async () => {
  const d = fresh(),
    p = await prepareCsv(
      csv([row(), row({ セット番号: "2", 回数: "限界" })]),
      "one.csv",
    );
  const r = await importCsv(d, p);
  expect((await exportBackup(d)).data.importRows).toHaveLength(2);
  await rollbackCsv(d, r.batchId);
  expect((await d.sets.toArray()).every((s) => !!s.deletedAt)).toBe(true);
  expect((await d.sessions.toArray()).every((s) => !!s.deletedAt)).toBe(true);
  expect((await d.importRows.toArray()).every((s) => !!s.deletedAt)).toBe(true);
});
it("does not trust forged preview eligibility", async () => {
  const p = await prepareCsv(csv([row({ 回数: "限界" })]), "one.csv");
  p.rows[0].eligible = true;
  p.rows[0].reps = 15;
  const d = fresh();
  expect((await importCsv(d, p)).imported).toBe(0);
});
