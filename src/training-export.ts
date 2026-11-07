import { type AppDB } from "./db";
import { formatRir, kgToDisplay } from "./model";
import { sessionDay } from "./training";
// Protect spreadsheet users from formula evaluation in user-authored text.
const cell = (value: string | number) =>
  '"' +
  String(
    typeof value === "string" && /^[=+\-@\t\r]/.test(value)
      ? "'" + value
      : value,
  ).replaceAll('"', '""') +
  '"';
export async function exportTrainingCsv(db: AppDB) {
  return db.transaction("r", [db.sessions, db.sets], async () => {
    const sessions = (await db.sessions.toArray()).filter(
      (s) => !s.deletedAt && s.status === "finished",
    );
    const rows = (await db.sets.toArray()).filter(
      (r) => !r.deletedAt && r.completedAt,
    );
    const output: (string | number)[][] = [
      [
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
      ],
    ];
    for (const session of sessions.sort((a, b) =>
      sessionDay(a).localeCompare(sessionDay(b)),
    ))
      for (const r of rows
        .filter((r) => r.sessionId === session.id)
        .sort(
          (a, b) =>
            a.exerciseId.localeCompare(b.exerciseId) || a.ordinal - b.ordinal,
        )) {
        const name =
            session.exercises.find((e) => e.exerciseId === r.exerciseId)
              ?.name ?? r.exerciseId,
          unit = r.inputUnit ?? "kg";
        output.push([
          sessionDay(session),
          name,
          r.ordinal + 1,
          r.inputWeight ?? kgToDisplay(r.weightKg, unit),
          unit,
          r.reps,
          r.rir === null ? "" : formatRir(r.rir),
          r.notes,
          "実績として記載",
          "過去記録から確認",
        ]);
      }
    return "\uFEFF" + output.map((row) => row.map(cell).join(",")).join("\r\n");
  });
}
