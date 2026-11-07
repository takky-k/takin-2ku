import { useState } from "react";
import { z } from "zod";
import { type AppDB, meta, save } from "./db";
import { type Entities, round, localDate } from "./model";
import { stableId } from "./csv";
const stage = z.enum(["asleep", "core", "deep", "rem", "awake", "inBed"]);
const sampleSchema = z
  .object({
    type: z.literal("sleep"),
    startAt: z.iso.datetime({ offset: true }),
    endAt: z.iso.datetime({ offset: true }),
    dateLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    stage,
    source: z.string().min(1).max(200),
    externalId: z.string().optional(),
  })
  .refine((r) => {
    const duration = Date.parse(r.endAt) - Date.parse(r.startAt);
    return (
      duration > 0 &&
      duration <= 24 * 3600000 &&
      new Date(r.dateLocal + "T12:00:00Z").toISOString().slice(0, 10) ===
        r.dateLocal
    );
  }, "睡眠区間の日付・時刻が不正です");
const payloadSchema = z
  .object({
    app: z.literal("takin-2ku-health"),
    schemaVersion: z.literal(1),
    samples: z.array(sampleSchema).max(10000),
  })
  .strict();
export type HealthPayload = z.infer<typeof payloadSchema>;
export function parseHealthJson(text: string): HealthPayload {
  return payloadSchema.parse(JSON.parse(text));
}
export async function importHealth(db: AppDB, payload: HealthPayload) {
  payload = parseHealthJson(JSON.stringify(payload));
  const records: Entities["health"][] = [];
  for (const sample of payload.samples) {
    const startAt = new Date(sample.startAt).toISOString(),
      endAt = new Date(sample.endAt).toISOString();
    const hash = await stableId(
      JSON.stringify([
        "sleep",
        sample.source,
        startAt,
        endAt,
        sample.stage,
        sample.dateLocal,
      ]),
    );
    records.push({
      ...meta(),
      id: hash,
      source: sample.source,
      type: "sleep",
      value: (Date.parse(endAt) - Date.parse(startAt)) / 3600000,
      unit: "h",
      startAt,
      endAt,
      dateLocal: sample.dateLocal,
      stage: sample.stage,
      externalId: sample.externalId,
      sourceRecordHash: hash,
      importedAt: new Date().toISOString(),
    });
  }
  let added = 0,
    duplicates = 0;
  await db.transaction("rw", [db.health, db.queue], async () => {
    for (const record of records) {
      if (
        await db.health
          .where("sourceRecordHash")
          .equals(record.sourceRecordHash)
          .count()
      ) {
        duplicates++;
        continue;
      }
      await save(db, "health", record);
      added++;
    }
  });
  return { added, duplicates };
}
export function sleepHoursForDate(
  samples: Entities["health"][],
  date: string,
): number | null {
  const intervals = samples
    .filter(
      (s) =>
        !s.deletedAt &&
        s.type === "sleep" &&
        s.dateLocal === date &&
        s.endAt &&
        s.stage &&
        ["asleep", "core", "deep", "rem"].includes(s.stage),
    )
    .map((s) => [Date.parse(s.startAt), Date.parse(s.endAt!)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((a, b) => a[0] - b[0]);
  if (!intervals.length) return null;
  let [start, end] = intervals[0],
    total = 0;
  for (const [a, b] of intervals.slice(1)) {
    if (a <= end) end = Math.max(end, b);
    else {
      total += end - start;
      start = a;
      end = b;
    }
  }
  return (total + end - start) / 3600000;
}
export function SleepImport({
  database,
  compact = false,
}: {
  database: AppDB;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [preview, setPreview] = useState<HealthPayload | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="sleep-import">
      {compact ? (
        <button
          type="button"
          className="text-button"
          onClick={() => setOpen(!open)}
        >
          睡眠をショートカットから取り込む
        </button>
      ) : (
        <h2>睡眠・ショートカット連携</h2>
      )}
      {(!compact || open) && (
        <>
          <p className="hint">
            読み取り専用です。iPhoneのショートカットで睡眠のJSONファイルを作り、ここで選択します。自動同期やApple
            Healthへの書き込みは行いません。
          </p>
          <LinkGuide />
          <label>
            睡眠JSONファイル
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void (async () => {
                    try {
                      if (file.size > 5_000_000)
                        throw Error("5MB以内のJSONを選択してください");
                      setPreview(parseHealthJson(await file.text()));
                      setMessage("");
                    } catch (err) {
                      setPreview(null);
                      setMessage("読み込み失敗：" + String(err));
                    }
                  })();
                e.target.value = "";
              }}
            />
          </label>
          {preview && (
            <div className="notice">
              <p>
                {preview.samples.length}区間を検証しました。今日の睡眠：
                {(() => {
                  const samples = preview.samples.map((s) => ({
                    ...s,
                    ...meta(),
                    type: "sleep",
                    value: 0,
                    unit: "h",
                    sourceRecordHash: "preview",
                    importedAt: new Date().toISOString(),
                  }));
                  const hours = sleepHoursForDate(samples, localDate());
                  return hours === null ? "未取得" : `${round(hours)}時間`;
                })()}
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void importHealth(database, preview)
                    .then((r) => {
                      setMessage(
                        `睡眠データ ${r.added}区間を取り込みました（重複 ${r.duplicates}区間）。`,
                      );
                      setPreview(null);
                    })
                    .catch((e) => setMessage(`取り込み失敗：${String(e)}`))
                    .finally(() => setBusy(false));
                }}
              >
                確認して睡眠データを取り込む
              </button>
              <button disabled={busy} onClick={() => setPreview(null)}>
                取消
              </button>
            </div>
          )}
          <p role="status">{message}</p>
        </>
      )}
    </div>
  );
}
function LinkGuide() {
  return (
    <details>
      <summary>iPhone側の設定手順</summary>
      <ol className="hint">
        <li>
          ショートカットで「ヘルスケアサンプルを検索」を追加し、種類を睡眠、期間を直近数日で絞ります。初回の読み取り許可は本人が行ってください。
        </li>
        <li>
          各サンプルの開始・終了をISO
          8601（タイムゾーン付き）、終了日をyyyy-MM-ddで取得します。睡眠段階・データソースとともに辞書へ入れます。
        </li>
        <li>
          下の形式のJSONを「ファイルを保存」で保存し、この画面から選択します。就床中・覚醒は睡眠時間へ足さず、重複する睡眠区間も二重集計しません。
        </li>
      </ol>
      <a
        className="button full"
        href="./shortcuts-sleep.html"
        target="_blank"
        rel="noreferrer"
      >
        詳しい設定とJSON形式
      </a>
      <p className="hint">
        iPhone実機でのショートカット設定・データ型は未検証です。ファイル取込の準備だけで、連携済みとは表示しません。
      </p>
    </details>
  );
}
