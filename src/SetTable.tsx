import { resolvedReps } from "./set-values";
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
    <>
      <table className="workout-table compact-sheet">
        <caption className="sr-only">セットの直接入力</caption>
        <colgroup>
          <col className="set-column" />
          <col className="previous-column" />
          <col className="weight-column" />
          <col className="reps-column" />
          <col className="rir-column" />
          <col className="delete-column" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">SET</th>
            <th scope="col">前回</th>
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
      <details className="set-notes">
        <summary>メモ</summary>
        <table>
          <thead>
            <tr>
              <th>SET</th>
              <th>メモ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <th>{index + 1}</th>
                <td>
                  <SetNote database={database} row={row} index={index} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
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
    [error, setError] = useState("");
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
    }
  }, [row.revision, unit]);
  async function persist(next: Fields) {
    try {
      const current = latest.current;
      const validWeight =
        next.weight.trim() !== "" &&
        Number.isFinite(Number(next.weight)) &&
        Number(next.weight) >= 0 &&
        displayToKg(Number(next.weight), unit) <= 2000;
      let repsValue = current.reps,
        repsSource: WorkoutSet["repsSource"] = current.repsSource,
        validReps = true;
      try {
        const resolved = resolvedReps(current, next);
        repsValue = resolved.reps;
        repsSource = resolved.source;
      } catch {
        validReps = false;
      }
      let rir: WorkoutSet["rir"] = null,
        validRir = true;
      try {
        rir = parseRir(next.rir);
      } catch {
        validRir = false;
      }
      const recorded =
        validWeight &&
        validReps &&
        validRir &&
        (next.weightTouched ||
          next.repsTouched ||
          next.rir.trim() !== "" ||
          !!current.completedAt);
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
        reps: validReps ? repsValue : current.reps,
        repsSource: validReps ? repsSource : current.repsSource,
        rir: validRir ? rir : current.rir,
        rirRaw: next.rir,
        rirConfidence: rir
          ? rir.min === rir.max
            ? "exact"
            : "range"
          : "unknown",
        inputState: next,
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
        <td className="previous-cell">
          {reference ? (
            <>
              <span>
                {round(kgToDisplay(reference.weightKg, unit))}
                {unit}
              </span>
              <span>× {reference.reps}回</span>
            </>
          ) : (
            "—"
          )}
        </td>
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
              row.inputState && !row.inputState.repsTouched && row.reps > 0
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
          <td colSpan={6} role="alert" className="error">
            {error}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function SetNote({
  database,
  row,
  index,
}: {
  database: AppDB;
  row: WorkoutSet;
  index: number;
}) {
  const [note, setNote] = useState(row.notes),
    [error, setError] = useState(""),
    dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setNote(row.notes);
  }, [row.revision]);
  return (
    <>
      <textarea
        aria-label={`セット${index + 1}のメモ`}
        value={note}
        onChange={(e) => {
          dirty.current = true;
          const value = e.target.value;
          setNote(value);
          void saveSetInputs(database, row, { notes: value })
            .then(() => setError(""))
            .catch((e) => setError(String(e)));
        }}
        onBlur={() => {
          dirty.current = false;
        }}
      />
      {error && <p role="alert">保存できませんでした：{error}</p>}
    </>
  );
}
