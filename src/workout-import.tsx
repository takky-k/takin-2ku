import { useState } from "react";
import { z } from "zod";
import { type AppDB, meta, save, revised } from "./db";
import { displayToKg, rirSchema, formatRir } from "./model";
import { sessionDay } from "./training";
import { stableId } from "./csv";

const value = z.object({
  weight: z.number().min(0).max(2000),
  reps: z.number().int().min(0).max(1000),
  rir: rirSchema,
});
const payloadSchema = z
  .object({
    app: z.literal("takin-2ku-workout"),
    schemaVersion: z.literal(1),
    importId: z.string().min(1).max(200),
    dateLocal: z.iso.date(),
    name: z.string().min(1),
    unit: z.enum(["kg", "lb"]),
    exercises: z
      .array(
        z.object({
          exerciseName: z.string().min(1),
          equipmentId: z.string().optional(),
          sets: z
            .array(
              value.extend({ notes: z.string(), previous: value.optional() }),
            )
            .min(1)
            .max(100),
        }),
      )
      .min(1)
      .max(100),
  })
  .strict();
export type WorkoutImport = z.infer<typeof payloadSchema>;
export const parseWorkoutImport = (text: string) =>
  payloadSchema.parse(JSON.parse(text));
export async function importWorkout(db: AppDB, input: WorkoutImport) {
  const payload = payloadSchema.parse(input),
    batchId = await stableId("workout-import:" + payload.importId),
    sessionId = await stableId("workout-session:" + payload.importId);
  return db.transaction(
    "rw",
    [db.exercises, db.sessions, db.sets, db.importBatches, db.queue],
    async () => {
      if (await db.importBatches.get(batchId))
        return { added: 0, corrected: 0, duplicate: true };
      const exercises = await db.exercises.toArray();
      const resolved = payload.exercises.map((item) => {
        let found = exercises.filter(
          (e) =>
            !e.deletedAt &&
            e.name === item.exerciseName &&
            (item.equipmentId === undefined ||
              e.equipmentId === item.equipmentId),
        );
        if (found.length > 1) {
          const defaults = found.filter((e) => e.source === "default-v2.1");
          if (defaults.length === 1) found = defaults;
        }
        if (found.length !== 1)
          throw Error(
            `${item.exerciseName}：既存種目を一意に選べません。種目名・機器IDを確認してください。`,
          );
        return { ...item, exercise: found[0] };
      });
      if (new Set(resolved.map((e) => e.exercise.id)).size !== resolved.length)
        throw Error("同じ種目が重複しています");
      const expected = resolved.flatMap((item) =>
        item.sets.map((set, ordinal) => ({
          item,
          set,
          ordinal,
          weightKg: displayToKg(set.weight, payload.unit),
        })),
      );
      const allSets = await db.sets.toArray(),
        sameDay = (await db.sessions.toArray()).filter(
          (s) =>
            !s.deletedAt &&
            s.status === "finished" &&
            sessionDay(s) === payload.dateLocal,
        );
      const matches = sameDay.filter((s) => {
        const rows = allSets.filter(
          (r) => !r.deletedAt && r.sessionId === s.id,
        );
        return (
          rows.length === expected.length &&
          expected.every((e) =>
            rows.some(
              (r) =>
                r.exerciseId === e.item.exercise.id &&
                r.equipmentId === e.item.exercise.equipmentId &&
                r.ordinal === e.ordinal &&
                Math.abs(r.weightKg - e.weightKg) < 0.00001 &&
                r.reps === e.set.reps,
            ),
          )
        );
      });
      if (matches.length > 1)
        throw Error(
          "同じ内容の履歴が複数あります。重複を確認してから取り込んでください",
        );
      const existing = matches[0],
        stamp = payload.dateLocal + "T12:00:00.000Z",
        id = existing?.id ?? sessionId;
      if (!existing && (await db.sessions.get(sessionId)))
        throw Error(
          "同じ取込IDの記録があります。削除済み記録を自動復活しません",
        );
      if (!existing) {
        const snapshots = resolved.map(({ exercise: e }) => ({
          exerciseId: e.id,
          name: e.name,
          muscle: e.muscle,
          equipmentId: e.equipmentId,
          notes: "",
          evergreenNotes: e.evergreenNotes,
          measurementBasis: e.measurementBasis,
        }));
        await save(db, "sessions", {
          ...meta(),
          id,
          source: "private-workout-import",
          name: payload.name,
          status: "finished",
          startedAt: stamp,
          endedAt: null,
          performedDateLocal: payload.dateLocal,
          timePrecision: "date",
          planId: null,
          exercises: snapshots,
          notes: "",
        });
      }
      let added = 0,
        corrected = 0;
      for (const { item, set, ordinal, weightKg } of expected) {
        const previous = set.previous
          ? {
              weightKg: displayToKg(set.previous.weight, payload.unit),
              reps: set.previous.reps,
              rir: set.previous.rir,
            }
          : undefined;
        const old = existing
          ? allSets.find(
              (r) =>
                !r.deletedAt &&
                r.sessionId === id &&
                r.exerciseId === item.exercise.id &&
                r.ordinal === ordinal,
            )
          : undefined;
        if (old) {
          await save(
            db,
            "sets",
            revised({
              ...old,
              rir: set.rir,
              rirRaw: set.rir === null ? "" : formatRir(set.rir),
              rirConfidence: set.rir
                ? set.rir.min === set.rir.max
                  ? "exact"
                  : "range"
                : "unknown",
              referencePrevious: previous ?? old.referencePrevious,
              inputState: old.inputState
                ? {
                    ...old.inputState,
                    rir: set.rir === null ? "" : formatRir(set.rir),
                  }
                : undefined,
            }),
          );
          corrected++;
        } else {
          await save(db, "sets", {
            ...meta(),
            source: "private-workout-import",
            sessionId: id,
            exerciseId: item.exercise.id,
            equipmentId: item.exercise.equipmentId,
            ordinal,
            setType: "normal",
            weightKg,
            reps: set.reps,
            rir: set.rir,
            rirRaw: set.rir === null ? "" : formatRir(set.rir),
            rirConfidence: set.rir
              ? set.rir.min === set.rir.max
                ? "exact"
                : "range"
              : "unknown",
            inputUnit: payload.unit,
            inputWeight: set.weight,
            rpe: null,
            completedAt: stamp,
            notes: set.notes,
            restSeconds: null,
            referencePrevious: previous,
          });
          added++;
        }
      }
      await save(db, "importBatches", {
        ...meta(),
        id: batchId,
        source: "private-workout-import",
        fileName: payload.name,
        fileHash: batchId,
        rowCount: expected.length,
        importedCount: added + corrected,
        reviewCount: 0,
      });
      return { added, corrected, duplicate: false };
    },
  );
}
export function WorkoutImportPanel({ database }: { database: AppDB }) {
  const [preview, setPreview] = useState<WorkoutImport | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="card">
      <h2>日付指定のトレーニング取込</h2>
      <p className="hint">
        本人の記録JSONを端末内で検証して取り込みます。種目は既存IDを再利用。同日・同一セットの実績があればRIRと比較メモだけを修正し、別の履歴は保持します。
      </p>
      <label>
        トレーニングJSONファイル
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              if (file.size > 5_000_000)
                throw Error("5MB以内のファイルを選択してください");
              setPreview(parseWorkoutImport(await file.text()));
              setMessage("");
            } catch (err) {
              setPreview(null);
              setMessage(String(err));
            }
          }}
        />
      </label>
      {preview && (
        <div className="notice">
          <p>
            {preview.dateLocal} · {preview.exercises.length}種目 ·{" "}
            {preview.exercises.reduce((n, e) => n + e.sets.length, 0)}セット ·{" "}
            {preview.unit}
          </p>
          <p>
            時刻不明の実績として保存します。前回比較メモは実績・統計に含みません。
          </p>
          <button
            disabled={busy}
            className="primary"
            onClick={async () => {
              setBusy(true);
              try {
                const r = await importWorkout(database, preview);
                setMessage(
                  r.duplicate
                    ? "取込済みです。重複登録しません。"
                    : `取り込み完了：追加${r.added}セット、RIR修正${r.corrected}セット`,
                );
                setPreview(null);
              } catch (err) {
                setMessage(String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            確認して実績を保存
          </button>
        </div>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
