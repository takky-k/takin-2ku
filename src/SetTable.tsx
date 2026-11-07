import { Fragment, useEffect, useState, useRef } from "react";
import { type AppDB, remove } from "./db";
import {
  type WorkoutSet,
  formatRir,
  parseRir,
  displayToKg,
  kgToDisplay,
  round,
} from "./model";
import { saveSetInputs } from "./set-inputs";
type Fields = NonNullable<WorkoutSet["inputState"]>;
export function SetTable({
  database,
  rows,
  previous,
  unit,
}: {
  database: AppDB;
  rows: WorkoutSet[];
  previous: WorkoutSet[];
  unit: "kg" | "lb";
}) {
  return (
    <table className="workout-table compact-sheet">
      <caption className="sr-only">セットの直接入力</caption>
      <colgroup>
        <col className="set-column" />
        <col />
        <col />
        <col />
        <col className="delete-column" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">SET</th>
          <th scope="col">重量 ({unit})</th>
          <th scope="col">REPS</th>
          <th scope="col">RIR</th>
          <th scope="col">
            <span className="sr-only">最終行の削除</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <SetRow
            key={row.id + "-" + unit}
            database={database}
            row={row}
            previous={previous[index]}
            index={index}
            unit={unit}
            last={index === rows.length - 1}
          />
        ))}
      </tbody>
    </table>
  );
}
function initial(row: WorkoutSet, unit: "kg" | "lb"): Fields {
  return row.inputState
    ? {
        ...row.inputState,
        weight:
          row.inputUnit === unit
            ? row.inputState.weight
            : String(round(kgToDisplay(row.weightKg, unit))),
        weightTouched:
          row.inputUnit === unit ? row.inputState.weightTouched : false,
      }
    : {
        weight: String(round(kgToDisplay(row.weightKg, unit))),
        reps: row.completedAt ? String(row.reps) : "",
        rir: row.rir === null ? "" : formatRir(row.rir),
        weightTouched: false,
        repsTouched: !!row.completedAt,
      };
}
function SetRow({
  database,
  row,
  previous,
  index,
  unit,
  last,
}: {
  database: AppDB;
  row: WorkoutSet;
  previous?: WorkoutSet;
  index: number;
  unit: "kg" | "lb";
  last: boolean;
}) {
  const key = `takin-sheet-draft-${database.name}-${row.id}`;
  const [fields, setFields] = useState<Fields>(() => {
      try {
        const cache = localStorage.getItem(key);
        if (cache) {
          const value = JSON.parse(cache);
          if (
            value.unit === unit &&
            typeof value.fields?.weight === "string" &&
            typeof value.fields?.reps === "string" &&
            typeof value.fields?.rir === "string"
          )
            return value.fields;
        }
        const old = localStorage.getItem(
          `takin-table-draft-${database.name}-${row.id}-${unit}`,
        );
        if (old) {
          const value = JSON.parse(old);
          if (
            typeof value.weight === "string" &&
            typeof value.reps === "string" &&
            typeof value.rir === "string"
          )
            return { ...value, weightTouched: true, repsTouched: true };
        }
      } catch {
        /* Primary values are still in IndexedDB. */
      }
      return initial(row, unit);
    }),
    [error, setError] = useState(""),
    [note, setNote] = useState(row.notes);
  const dirty = useRef(false),
    latest = useRef(row),
    observedRevision = useRef(row.revision);
  latest.current = row;
  useEffect(() => {
    try {
      if (
        localStorage.getItem(
          `takin-table-draft-${database.name}-${row.id}-${unit}`,
        )
      ) {
        dirty.current = true;
        void persist(fields);
      }
    } catch {
      /* IndexedDB remains primary. */
    }
  }, []);
  useEffect(() => {
    if (observedRevision.current === row.revision) return;
    observedRevision.current = row.revision;
    if (!dirty.current) {
      setFields(initial(row, unit));
      setNote(row.notes);
    }
  }, [row.revision, unit]);
  async function persist(next: Fields, notes = note) {
    try {
      const validWeight =
        next.weight.trim() !== "" &&
        Number.isFinite(Number(next.weight)) &&
        Number(next.weight) >= 0 &&
        displayToKg(Number(next.weight), unit) <= 2000;
      const validReps = /^\d+$/.test(next.reps) && Number(next.reps) <= 1000;
      let rir: WorkoutSet["rir"] = null,
        validRir = true;
      try {
        rir = parseRir(next.rir);
      } catch {
        validRir = false;
      }
      const current = latest.current,
        recorded = validWeight && validReps && validRir && next.repsTouched;
      await saveSetInputs(database, current, {
        weightKg: validWeight
          ? next.weightTouched
            ? displayToKg(Number(next.weight), unit)
            : current.weightKg
          : current.weightKg,
        inputUnit: unit,
        inputWeight: validWeight
          ? next.weightTouched
            ? Number(next.weight)
            : kgToDisplay(current.weightKg, unit)
          : current.inputWeight,
        reps: validReps ? Number(next.reps) : current.reps,
        rir: validRir ? rir : current.rir,
        rirRaw: next.rir,
        rirConfidence: rir
          ? rir.min === rir.max
            ? "exact"
            : "range"
          : "unknown",
        inputState: next,
        notes,
        completedAt: recorded
          ? (current.completedAt ?? new Date().toISOString())
          : null,
      });
      const saved = await database.sets.get(row.id);
      if (saved) latest.current = saved;
      try {
        localStorage.removeItem(
          `takin-table-draft-${database.name}-${row.id}-${unit}`,
        );
        const cache = localStorage.getItem(key);
        if (
          cache &&
          JSON.stringify(JSON.parse(cache).fields) === JSON.stringify(next)
        )
          localStorage.removeItem(key);
      } catch {
        /* Primary write succeeded. */
      }
      setError(
        !validRir
          ? "RIRは0〜10、0.5刻み、1~2の範囲で入力してください"
          : next.reps !== "" && !validReps
            ? "回数は0以上の整数で入力してください"
            : !validWeight && next.weight !== ""
              ? "重量を確認してください"
              : "",
      );
    } catch (e) {
      setError(`保存できませんでした：${String(e)}`);
    }
  }
  function edit(field: "weight" | "reps" | "rir", value: string) {
    dirty.current = true;
    const next = {
      ...fields,
      [field]: value,
      ...(field === "weight"
        ? { weightTouched: true }
        : field === "reps"
          ? { repsTouched: true }
          : {}),
    };
    setFields(next);
    try {
      localStorage.setItem(key, JSON.stringify({ unit, fields: next }));
    } catch {
      setError("入力途中の補助保存が利用できません");
    }
    void persist(next);
  }
  async function deleteLast() {
    if (!last) return;
    try {
      await database.transaction(
        "rw",
        [database.sets, database.queue],
        async () => {
          const active = await database.sets
            .where("sessionId")
            .equals(row.sessionId)
            .filter((s) => !s.deletedAt && s.exerciseId === row.exerciseId)
            .sortBy("ordinal");
          if (active.at(-1)?.id !== row.id)
            throw Error("行が変更されました。最後の行を確認してください");
          const current = await database.sets.get(row.id);
          if (current) await remove(database, "sets", current);
        },
      );
    } catch (e) {
      setError(String(e));
    }
  }
  const reference = previous ?? row.referencePrevious;
  return (
    <Fragment>
      <tr className={row.completedAt ? "recorded-set" : ""}>
        <th scope="row">
          {index + 1}
          <span className="sr-only">
            {row.completedAt ? "入力済み" : "未入力"}
          </span>
        </th>
        <td>
          <input
            aria-label={`セット${index + 1}の重量`}
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={fields.weight}
            onChange={(e) => edit("weight", e.target.value)}
            onBlur={() => {
              dirty.current = false;
              void persist(fields);
            }}
          />
        </td>
        <td>
          <input
            aria-label={`セット${index + 1}の回数`}
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            placeholder={
              row.inputState && !row.inputState.repsTouched
                ? String(row.reps)
                : "回数"
            }
            value={fields.reps}
            onChange={(e) => edit("reps", e.target.value)}
            onBlur={() => {
              dirty.current = false;
              void persist(fields);
            }}
          />
        </td>
        <td>
          <input
            aria-label={`セット${index + 1}のRIR`}
            type="text"
            inputMode="text"
            placeholder="任意"
            value={fields.rir}
            onChange={(e) => edit("rir", e.target.value)}
            onBlur={() => {
              dirty.current = false;
              void persist(fields);
            }}
          />
        </td>
        <td>
          {last && (
            <button
              className="delete-last"
              aria-label={`最終セット${index + 1}を削除`}
              onClick={() => void deleteLast()}
            >
              ×
            </button>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={5} role="alert" className="error">
            {error}
          </td>
        </tr>
      )}
      <tr className="set-detail-row">
        <td colSpan={5}>
          {reference && (
            <small className="row-reference">
              前回：{round(kgToDisplay(reference.weightKg, unit))}
              {unit} × {reference.reps}回 / RIR {formatRir(reference.rir)}
              {!previous ? "（日付不明の比較メモ）" : ""}
            </small>
          )}
          <details>
            <summary>
              セット{index + 1}のメモ{note ? " · 記入あり" : ""}
            </summary>
            <textarea
              aria-label={`セット${index + 1}のメモ`}
              value={note}
              onChange={(e) => {
                dirty.current = true;
                setNote(e.target.value);
                void persist(fields, e.target.value);
              }}
            />
          </details>
        </td>
      </tr>
    </Fragment>
  );
}
