import { useState } from "react";
import { type AppDB, meta, save, revised, remove } from "./db";
import {
  type Entities,
  type PlannedSet,
  kgToDisplay,
  displayToKg,
  round,
  formatRir,
  parseRir,
} from "./model";
import { targets } from "./training";
export function PlanEditor({
  plan,
  close,
  database,
  exercises,
  unit,
}: {
  plan: Entities["plans"];
  close: () => void;
  database: AppDB;
  exercises: Entities["exercises"][];
  unit: "kg" | "lb";
}) {
  const [draft, setDraft] = useState(() => ({
      ...plan,
      exercises: plan.exercises.map((t) => ({
        ...t,
        plannedSets: targets(t, unit),
      })),
    })),
    [error, setError] = useState(""),
    [rirText, setRirText] = useState<Record<string, string>>({});
  const updateSet = (i: number, n: number, patch: Partial<PlannedSet>) =>
    setDraft((p) => ({
      ...p,
      exercises: p.exercises.map((t, k) =>
        k === i
          ? {
              ...t,
              plannedSets: t.plannedSets.map((s, j) =>
                j === n ? { ...s, ...patch } : s,
              ),
            }
          : t,
      ),
    }));
  const commit = async () => {
    try {
      if (!draft.name.trim() || !draft.exercises.length)
        throw Error("名前と1種目以上を入力してください");
      const next = {
        ...draft,
        exercises: draft.exercises.map((t) => {
          const sets = t.plannedSets.map((s) => ({
            ...s,
            targetRir: s.id in rirText ? parseRir(rirText[s.id]) : s.targetRir,
          }));
          if (!sets.length) throw Error("各種目に1セット以上必要です");
          return {
            ...t,
            plannedSets: sets,
            targetSets: sets.length,
            plannedWeightKg: sets[0].weightKg,
            repMin: Math.min(...sets.map((s) => s.reps)),
            repMax: Math.max(...sets.map((s) => s.reps)),
            targetRir: sets[0].targetRir,
          };
        }),
      };
      await save(database, "plans", revised(next));
      close();
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <section className="card editor" aria-label="メニュー編集">
      <h2>メニュー編集</h2>
      <p className="hint">
        予定値を編集します。実績・過去のセッションは変わりません。
      </p>
      <label>
        メニュー名
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <label>
        曜日・部位
        <input
          value={draft.dayLabel}
          onChange={(e) => setDraft({ ...draft, dayLabel: e.target.value })}
        />
      </label>
      <label>
        メニュー共通メモ
        <textarea
          value={draft.generalNotes ?? ""}
          onChange={(e) => setDraft({ ...draft, generalNotes: e.target.value })}
        />
      </label>
      {draft.exercises.map((t, i) => (
        <div className="plan-exercise" key={t.exerciseId}>
          <h3>{exercises.find((e) => e.id === t.exerciseId)?.name}</h3>
          {t.plannedSets.map((s, n) => (
            <div className="planned-set" key={s.id}>
              <small>
                予定 SET {n + 1}
                {s.isLocked ? " · 自動増量なし" : ""}
              </small>
              <div className="input-grid">
                <label>
                  予定重量 ({unit})
                  <input
                    aria-label={`予定${i + 1}-${n + 1}の重量`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={round(kgToDisplay(s.weightKg, unit))}
                    onChange={(e) =>
                      updateSet(i, n, {
                        weightKg: displayToKg(Number(e.target.value), unit),
                        inputWeight: Number(e.target.value),
                        inputUnit: unit,
                      })
                    }
                  />
                </label>
                <label>
                  予定回数
                  <input
                    aria-label={`予定${i + 1}-${n + 1}の回数`}
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={s.reps}
                    onChange={(e) =>
                      updateSet(i, n, { reps: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  目標RIR
                  <input
                    inputMode="decimal"
                    aria-label={`予定${i + 1}-${n + 1}のRIR`}
                    value={
                      rirText[s.id] ??
                      (s.targetRir ? formatRir(s.targetRir) : "")
                    }
                    onChange={(e) =>
                      setRirText({ ...rirText, [s.id]: e.target.value })
                    }
                  />
                </label>
              </div>
              <button
                disabled={t.plannedSets.length === 1}
                onClick={() =>
                  setDraft({
                    ...draft,
                    exercises: draft.exercises.map((x, k) =>
                      k === i
                        ? {
                            ...x,
                            plannedSets: x.plannedSets.filter(
                              (_, j) => j !== n,
                            ),
                          }
                        : x,
                    ),
                  })
                }
              >
                予定セットを削除
              </button>
            </div>
          ))}
          <div className="actions">
            <button
              disabled={t.plannedSets.length >= 20}
              onClick={() =>
                setDraft({
                  ...draft,
                  exercises: draft.exercises.map((x, k) =>
                    k === i
                      ? {
                          ...x,
                          plannedSets: [
                            ...x.plannedSets,
                            {
                              ...x.plannedSets.at(-1)!,
                              id: crypto.randomUUID(),
                            },
                          ],
                        }
                      : x,
                  ),
                })
              }
            >
              予定セットを追加
            </button>
            <button
              disabled={i === 0}
              onClick={() => {
                const items = [...draft.exercises];
                [items[i - 1], items[i]] = [items[i], items[i - 1]];
                setDraft({ ...draft, exercises: items });
              }}
            >
              上へ
            </button>
            <button
              onClick={() =>
                setDraft({
                  ...draft,
                  exercises: draft.exercises.filter((_, j) => i !== j),
                })
              }
            >
              種目を外す
            </button>
          </div>
        </div>
      ))}
      <label>
        種目を追加
        <select
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (id)
              setDraft({
                ...draft,
                exercises: [
                  ...draft.exercises,
                  {
                    exerciseId: id,
                    targetSets: 1,
                    repMin: 8,
                    repMax: 12,
                    targetRir: { min: 2, max: 2 },
                    plannedWeightKg: 0,
                    plannedSets: [
                      {
                        id: crypto.randomUUID(),
                        weightKg: 0,
                        inputWeight: 0,
                        inputUnit: unit,
                        reps: 8,
                        targetRir: { min: 2, max: 2 },
                        setType: "normal",
                        isLocked: false,
                      },
                    ],
                  },
                ],
              });
          }}
        >
          <option value="">選択してください</option>
          {exercises
            .filter((e) => !draft.exercises.some((t) => t.exerciseId === e.id))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} / {e.equipmentId}
              </option>
            ))}
        </select>
      </label>
      <p role="alert">{error}</p>
      <div className="actions">
        <button className="primary" onClick={() => void commit()}>
          メニューを保存
        </button>
        <button onClick={close}>閉じる</button>
        <button
          onClick={() => {
            if (confirm("メニューを削除しますか？ 実績は保持します。"))
              void remove(database, "plans", plan)
                .then(close)
                .catch((e) => setError(String(e)));
          }}
        >
          削除
        </button>
      </div>
    </section>
  );
}
