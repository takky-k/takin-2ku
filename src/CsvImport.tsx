import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { AppDB } from "./db";
import {
  confirmReviewRow,
  prepareCsv,
  importCsv,
  rollbackCsv,
  type CsvPreview,
  csvColumns,
} from "./csv";
export function CsvImport({ database }: { database: AppDB }) {
  const [preview, setPreview] = useState<CsvPreview | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [limit, setLimit] = useState(20),
    [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const batches = useLiveQuery(
    () => database.importBatches.filter((b) => !b.deletedAt).toArray(),
    [database],
  );
  const review = useLiveQuery(
    () =>
      database.importRows
        .filter((r) => !r.deletedAt && r.status === "review")
        .toArray(),
    [database],
  );
  const [showReview, setShowReview] = useState(false);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>履歴CSVの取り込み</h2>
      <p className="hint">
        ファイルは端末内だけで処理します。実績と予定の曖昧な行・不明な数値は原文を保管し、分析には含めません。既存の記録は上書きしません。
      </p>
      <label>
        履歴CSVファイル
        <input
          disabled={busy}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f)
              void perform(async () => {
                if (f.size > 10_000_000)
                  throw Error("CSVは10MB以内にしてください");
                const text = new TextDecoder("utf-8", { fatal: true }).decode(
                  await f.arrayBuffer(),
                );
                setPreview(
                  await prepareCsv(
                    text,
                    f.name,
                    new Set(
                      (await database.importRows.toArray()).map((r) => r.id),
                    ),
                  ),
                );
                setConfirmed(new Set());
                setLimit(20);
                setMessage("");
              });
            e.target.value = "";
          }}
        />
      </label>
      {preview && (
        <div className="csv-preview">
          <h3>取り込みプレビュー</h3>
          <p>
            {preview.rows.length}行 / 実績候補{" "}
            {preview.rows.filter((r) => r.eligible && !r.duplicate).length}行 /
            要確認{" "}
            {preview.rows.filter((r) => !r.eligible && !r.duplicate).length}行 /
            既存・重複 {preview.rows.filter((r) => r.duplicate).length}行
          </p>
          <ul className="hint">
            {preview.mapping.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="notice">
            機種・片側/合計の情報は元CSVにありません。現在のマシンと統合せず「機種・重量基準未確認」として保存します。時刻も推測しません。
          </p>
          {preview.rows.slice(0, limit).map((r) => (
            <article className="csv-row" key={r.rowNumber}>
              <b>
                {r.rowNumber}行目 · {r.dateLocal} · {r.raw["種目"]}
              </b>
              <p>
                {r.raw["重量"]}
                {r.raw["重量単位"]} × {r.raw["回数"] || "不明"}回 / RIR{" "}
                {r.rirRaw || "未入力"}
              </p>
              <p className="hint">
                {r.raw["種目"] !== r.canonicalName &&
                  `名称対応：${r.canonicalName}。`}
                {r.duplicate
                  ? "既存ID・重複：取り込み時に差分も確認"
                  : r.eligible
                    ? "実績候補"
                    : r.issues.join(" / ")}
              </p>
              {r.issues.length > 0 &&
                r.issues.every((i) => i.startsWith("要件書の予定値と一致")) && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={confirmed.has(r.id)}
                      onChange={(e) =>
                        setConfirmed((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.add(r.id);
                          else next.delete(r.id);
                          return next;
                        })
                      }
                    />
                    この行は予定ではなく実施した実績と確認
                  </label>
                )}
            </article>
          ))}
          {limit < preview.rows.length && (
            <button onClick={() => setLimit((n) => n + 30)}>続きを表示</button>
          )}
          <div className="actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const result = await importCsv(database, preview, confirmed);
                  setMessage(
                    `実績 ${result.imported}件 / 原文のみ保留 ${result.review}件 / 重複 ${result.duplicates}件 / 競合 ${result.conflicts}件（既存を保持）`,
                  );
                  setPreview(null);
                })
              }
            >
              確認して取り込む
            </button>
            <button disabled={busy} onClick={() => setPreview(null)}>
              取消
            </button>
          </div>
        </div>
      )}
      <p role="status">{message}</p>
      {!!review?.length && (
        <>
          <button onClick={() => setShowReview(!showReview)}>
            要確認の原文 {review.length}件{showReview ? "を閉じる" : "を表示"}
          </button>
          {showReview &&
            review.map((r) => (
              <article className="csv-row" key={r.id}>
                <b>
                  {r.raw["日付"]} / {r.raw["種目"]} / セット
                  {r.raw["セット番号"]}
                </b>
                <p className="hint">{r.issues.join(" / ")}</p>
                <dl>
                  {csvColumns.map((c) => (
                    <div key={c}>
                      <dt>{c}</dt>
                      <dd>{r.raw[c] || "（空欄）"}</dd>
                    </div>
                  ))}
                </dl>
                {r.issues.every((i) =>
                  i.startsWith("要件書の予定値と一致"),
                ) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        await confirmReviewRow(database, r.id);
                        setMessage(
                          "本人確認した1行を実績へ反映しました。原文は保持しています。",
                        );
                      })
                    }
                  >
                    この行を実施した実績と確認して反映
                  </button>
                )}
              </article>
            ))}
        </>
      )}
      {batches?.map((b) => (
        <div className="import-batch" key={b.id}>
          <p>
            {b.fileName}
            <small>
              実績{b.importedCount}件 / 保留{b.reviewCount}件
            </small>
          </p>
          <button
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  "この取り込みを取り消しますか？ 後から編集した実績がある場合は停止します。",
                )
              )
                void perform(async () => {
                  await rollbackCsv(database, b.id);
                  setMessage(
                    "取り込みを取り消しました。削除情報は保持されます。",
                  );
                });
            }}
          >
            取り消す
          </button>
        </div>
      ))}
    </section>
  );
}
