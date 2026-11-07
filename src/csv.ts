import { aliases, catalog } from "./defaults";
import { type Entities, parseRir, displayToKg, type Rir } from "./model";
import { type AppDB, meta, save, revised, remove } from "./db";
export const csvColumns = [
  "日付",
  "種目",
  "セット番号",
  "重量",
  "重量単位",
  "回数",
  "RIR",
  "メモ",
  "データ区分",
  "確認状況",
] as const;
export function readCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += c;
      continue;
    }
    if (c === '"') {
      if (value || closed) throw Error("CSVの引用符が不正です");
      quoted = true;
    } else if (c === "," || c === "\n" || c === "\r") {
      row.push(value);
      value = "";
      closed = false;
      if (c !== ",") {
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
      }
    } else {
      if (closed) throw Error("CSVの引用符の後に不正な文字があります");
      value += c;
    }
  }
  if (quoted) throw Error("CSVの引用符が閉じられていません");
  if (value || row.length) {
    row.push(value);
    if (row.some((v) => v.trim())) rows.push(row);
  }
  return rows;
}
export async function stableId(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  const h = Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export interface CsvCandidate {
  id: string;
  exerciseId: string;
  sessionId: string;
  rowNumber: number;
  raw: Record<string, string>;
  issues: string[];
  eligible: boolean;
  duplicate: boolean;
  dateLocal: string;
  canonicalName: string;
  weight: number | null;
  unit: "kg" | "lb" | null;
  reps: number | null;
  ordinal: number | null;
  rir: Rir;
  rirRaw: string;
  rirConfidence: "exact" | "range" | "unknown" | "unverified";
}
export interface CsvPreview {
  fileName: string;
  fileHash: string;
  rows: CsvCandidate[];
  mapping: string[];
}
const number = (s: string) =>
  /^\d+(?:\.\d+)?$/.test(s.trim()) ? Number(s.trim()) : null;
export async function previewCsv(
  text: string,
  fileName: string,
  existing: Set<string> = new Set(),
): Promise<CsvPreview> {
  const records = readCsv(text),
    header = records.shift();
  if (!header || csvColumns.some((c) => !header.includes(c)))
    throw Error("必要なCSV列がありません：" + csvColumns.join("、"));
  if (new Set(header).size !== header.length)
    throw Error("CSVヘッダーに重複があります");
  const rows: CsvCandidate[] = [],
    seen = new Set<string>();
  for (const [index, cells] of records.entries()) {
    if (cells.length !== header.length)
      throw Error(`${index + 2}行目の列数が一致しません`);
    const raw = Object.fromEntries(header.map((h, n) => [h, cells[n]])),
      issues: string[] = [];
    const day = raw["日付"].trim(),
      name = raw["種目"].trim(),
      canonicalName = aliases[name] ?? name;
    const validDate =
      /^\d{4}-\d{2}-\d{2}$/.test(day) &&
      !Number.isNaN(Date.parse(day)) &&
      new Date(day).toISOString().slice(0, 10) === day;
    if (!validDate) issues.push("日付が不正");
    if (!name) issues.push("種目名が未入力");
    const weight = number(raw["重量"]),
      reps = number(raw["回数"]),
      ordinal = number(raw["セット番号"]),
      unit = raw["重量単位"].trim();
    if (weight === null || weight > 2000)
      issues.push("重量が未確定・範囲表記・範囲外");
    if (reps === null || !Number.isInteger(reps) || reps > 1000)
      issues.push("回数が未確定・限界・範囲表記");
    if (ordinal === null || !Number.isInteger(ordinal) || ordinal < 1)
      issues.push("セット番号が不正");
    if (unit !== "kg" && unit !== "lb") issues.push("単位が未確認");
    let rir: Rir = null,
      rirConfidence: CsvCandidate["rirConfidence"] = "unknown";
    const rirRaw = raw["RIR"];
    try {
      rir = parseRir(rirRaw);
      if (rir) rirConfidence = rir.min === rir.max ? "exact" : "range";
    } catch {
      issues.push("RIRは原文を保持・数値未確定");
      rirConfidence = "unverified";
    }
    if (
      !["実績として記載", "過去会話の実績要約"].includes(
        raw["データ区分"].trim(),
      )
    )
      issues.push("実績か予定か未確認");
    if (raw["確認状況"].trim() !== "過去記録から確認")
      issues.push("確認状況：" + raw["確認状況"]);
    const planned = catalog.find((e) => e.name === canonicalName);
    const group = planned ? (catalog.indexOf(planned) < 5 ? "A" : "B") : null;
    if (
      planned &&
      day === (group === "A" ? "2026-10-13" : "2026-10-14") &&
      ordinal !== null &&
      weight === planned.weights[ordinal - 1] &&
      reps === planned.reps[ordinal - 1] &&
      unit === "lb"
    )
      issues.push("要件書の予定値と一致：実績か本人確認が必要");
    const id = await stableId(
        "csv-row:" + JSON.stringify([day, name, raw["セット番号"].trim()]),
      ),
      duplicate = seen.has(id) || existing.has(id);
    seen.add(id);
    rows.push({
      id,
      exerciseId: await stableId(
        "csv-exercise:" + canonicalName + ":unknown-equipment",
      ),
      sessionId: await stableId("csv-date:" + day),
      rowNumber: index + 2,
      raw,
      issues,
      eligible: issues.length === 0,
      duplicate,
      dateLocal: day,
      canonicalName,
      weight,
      unit: unit === "kg" || unit === "lb" ? unit : null,
      reps,
      ordinal,
      rir,
      rirRaw,
      rirConfidence,
    });
  }
  return {
    fileName,
    fileHash: await stableId(text),
    rows,
    mapping: [
      "日付 → 実施日（時刻は不明のまま保持）",
      "種目 → 名称＋明示した別名対応（機種は未確認として分離）",
      "重量・重量単位 → 入力値/単位＋内部kg",
      "回数 → 確定した整数のみ。限界・範囲は原文保留",
      "RIR → 0/空欄/範囲を区別し原文・確度を保持",
      "メモ・データ区分・確認状況 → 行ごとの原文と来歴",
    ],
  };
}
export async function importCsv(
  db: AppDB,
  preview: CsvPreview,
  confirmed: Set<string> = new Set(),
) {
  // Reparse at commit time: caller/UI cannot bypass validation or deduplication.
  const columns = [
    ...new Set([
      ...csvColumns,
      ...preview.rows.flatMap((r) => Object.keys(r.raw)),
    ]),
  ];
  const serialized = [
    columns.join(","),
    ...preview.rows.map((r) =>
      columns
        .map((c) => '"' + (r.raw[c] ?? "").replaceAll('"', '""') + '"')
        .join(","),
    ),
  ].join("\n");
  const records = (await previewCsv(serialized, preview.fileName)).rows;
  let imported = 0,
    review = 0,
    duplicates = 0,
    conflicts = 0;
  const batchId = crypto.randomUUID();
  await db.transaction(
    "rw",
    [
      db.exercises,
      db.sessions,
      db.sets,
      db.importRows,
      db.importBatches,
      db.queue,
    ],
    async () => {
      for (const row of records) {
        const explicitlyConfirmed =
          confirmed.has(row.id) &&
          row.issues.every((i) => i.startsWith("要件書の予定値と一致"));
        const existing = await db.importRows.get(row.id);
        if (existing) {
          const same = Object.keys({ ...existing.raw, ...row.raw }).every(
            (c) => existing.raw[c] === row.raw[c],
          );
          if (!same) {
            conflicts++;
            continue;
          }
          if (!(
            existing.status === "review" &&
            !existing.deletedAt &&
            explicitlyConfirmed
          )) {
            duplicates++;
            continue;
          }
        }
        const eligible = row.eligible || explicitlyConfirmed;
        const sourceRow: Entities["importRows"] = {
          ...(existing ? revised(existing) : meta()),
          id: row.id,
          source: "history-csv",
          sourceHash: row.id,
          batchId,
          rowNumber: row.rowNumber,
          raw: row.raw,
          issues: explicitlyConfirmed
            ? [...row.issues, "ユーザーが実績と明示確認"]
            : row.issues,
          status: eligible ? "imported" : "review",
          setId: null,
          dateLocal: row.dateLocal,
        };
        if (eligible) {
          const unit = row.unit!;
          if (
            row.weight === null ||
            row.reps === null ||
            row.ordinal === null ||
            !unit
          )
            throw Error("CSVの数値検証に失敗");
          const exerciseId = row.exerciseId;
          let exercise = await db.exercises.get(exerciseId);
          if (!exercise) {
            const known = catalog.find((e) => e.name === row.canonicalName);
            exercise = {
              ...meta(),
              id: exerciseId,
              source: "history-csv",
              name: row.canonicalName,
              muscle: known?.muscle ?? "未分類",
              equipmentId: "CSV：機種・重量基準未確認",
              measurementBasis: "unknown",
              notes:
                "原CSVには機種・重量基準の列がありません。現在の機器とは区別して参照してください。",
              evergreenNotes: "",
              category: known?.category ?? "other",
              defaultRestSeconds: known?.rest ?? 120,
            };
            await save(db, "exercises", exercise);
          }
          const sessionId = row.sessionId;
          let session = await db.sessions.get(sessionId);
          const snapshot = {
            exerciseId,
            name: exercise.name,
            muscle: exercise.muscle,
            equipmentId: exercise.equipmentId,
            notes: "",
            evergreenNotes: "",
          };
          const timestamp = row.dateLocal + "T12:00:00.000Z"; // transport anchor only; all UI/analysis uses performedDateLocal.
          if (!session) {
            session = {
              ...meta(),
              id: sessionId,
              source: "history-csv",
              name: "CSVのトレーニング履歴",
              startedAt: timestamp,
              endedAt: null,
              status: "finished",
              planId: null,
              notes: "時刻・所要時間は記録なし。日付単位で取り込み。",
              performedDateLocal: row.dateLocal,
              timePrecision: "date",
              exercises: [snapshot],
            };
            await save(db, "sessions", session);
          } else if (
            !session.exercises.some((e) => e.exerciseId === exerciseId)
          )
            await save(
              db,
              "sessions",
              revised({
                ...session,
                exercises: [...session.exercises, snapshot],
              }),
            );
          const setId = row.id;
          sourceRow.setId = setId;
          await save(db, "sets", {
            ...meta(),
            id: setId,
            source: "history-csv",
            sourceRowId: row.id,
            sessionId,
            exerciseId,
            equipmentId: exercise.equipmentId,
            ordinal: row.ordinal - 1,
            setType: "normal",
            weightKg: displayToKg(row.weight, unit),
            inputWeight: row.weight,
            inputUnit: unit,
            loadMode: "unknown",
            reps: row.reps,
            rir: row.rir,
            rirRaw: row.rirRaw,
            rirConfidence: row.rirConfidence,
            rpe: null,
            completedAt: timestamp,
            notes: row.raw["メモ"],
            restSeconds: null,
          });
          imported++;
        } else review++;
        await save(db, "importRows", sourceRow);
      }
      if (imported || review)
        await save(db, "importBatches", {
          ...meta(),
          id: batchId,
          source: "history-csv",
          fileName: preview.fileName,
          fileHash: preview.fileHash,
          rowCount: records.length,
          importedCount: imported,
          reviewCount: review,
        });
    },
  );
  return { imported, review, duplicates, conflicts, batchId };
}
export const prepareCsv = previewCsv;
export async function confirmReviewRow(db: AppDB, id: string) {
  const row = await db.importRows.get(id);
  if (
    !row ||
    row.status !== "review" ||
    row.deletedAt ||
    !row.issues.every((i) => i.startsWith("要件書の予定値と一致"))
  )
    throw Error(
      "数値や記載に不明点があるため、この行はまだ実績へ変更できません",
    );
  const headers = Object.keys(row.raw);
  const text = [
    headers.join(","),
    headers.map((c) => '"' + row.raw[c].replaceAll('"', '""') + '"').join(","),
  ].join("\n");
  return importCsv(
    db,
    await prepareCsv(text, "本人確認した保留行"),
    new Set([id]),
  );
}
export async function rollbackCsv(db: AppDB, batchId: string) {
  await db.transaction(
    "rw",
    [db.sets, db.sessions, db.importRows, db.importBatches, db.queue],
    async () => {
      const rows = await db.importRows
        .where("batchId")
        .equals(batchId)
        .toArray();
      for (const row of rows) {
        if (row.setId) {
          const set = await db.sets.get(row.setId);
          if (set && !set.deletedAt) {
            if (set.revision > 1)
              throw Error(
                "取り込み後に編集されたセットがあります。履歴から個別に確認してください",
              );
            await remove(db, "sets", set);
          }
        }
        await remove(db, "importRows", row);
      }
      const batch = await db.importBatches.get(batchId);
      if (batch) await remove(db, "importBatches", batch);
      for (const s of (await db.sessions.toArray()).filter(
        (s) => s.source === "history-csv" && !s.deletedAt,
      )) {
        if (
          !(await db.sets
            .where("sessionId")
            .equals(s.id)
            .filter((r) => !r.deletedAt)
            .count())
        )
          await remove(db, "sessions", s);
      }
    },
  );
}
