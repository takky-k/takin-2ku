import { Fragment, useState } from "react";
import { type AppDB, save, revised, remove } from "./db";
import {
  type WorkoutSet,
  formatRir,
  parseRir,
  displayToKg,
  kgToDisplay,
  round,
} from "./model";
import { saveSetInputs } from "./set-inputs";
export function SetTable({
  database,
  rows,
  previous,
  unit,
  onCompleted,
}: {
  database: AppDB;
  rows: WorkoutSet[];
  previous: WorkoutSet[];
  unit: "kg" | "lb";
  onCompleted: (seconds: number) => void;
}) {
  async function move(row: WorkoutSet, other: WorkoutSet) {
    await database.transaction(
      "rw",
      [database.sets, database.queue],
      async () => {
        await save(
          database,
          "sets",
          revised({ ...row, ordinal: other.ordinal }),
        );
        await save(
          database,
          "sets",
          revised({ ...other, ordinal: row.ordinal }),
        );
      },
    );
  }
  return (
    <table className="workout-table">
      <caption className="sr-only">前回の記録と今回のセット入力</caption>
      <colgroup>
        <col className="previous-column" />
        <col />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">前回の記録</th>
          <th scope="col">
            今回の重量<small>({unit})</small>
          </th>
          <th scope="col">今回の回数</th>
          <th scope="col">今回のRIR</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <SetRow
            key={row.id}
            database={database}
            row={row}
            previous={previous[index]}
            index={index}
            unit={unit}
            onCompleted={onCompleted}
            onMove={async (delta) => {
              const other = rows[index + delta];
              if (other) await move(row, other);
            }}
            canUp={index > 0}
            canDown={index < rows.length - 1}
          />
        ))}
      </tbody>
    </table>
  );
}
function SetRow({
  database,
  row,
  previous,
  index,
  unit,
  onCompleted,
  onMove,
  canUp,
  canDown,
}: {
  database: AppDB;
  row: WorkoutSet;
  previous?: WorkoutSet;
  index: number;
  unit: "kg" | "lb";
  onCompleted: (n: number) => void;
  onMove: (delta: number) => Promise<void>;
  canUp: boolean;
  canDown: boolean;
}) {
  const key = `takin-table-draft-${database.name}-${row.id}-${unit}`;
  const [fields, setFields] = useState(() => {
      try {
        const cached = localStorage.getItem(key);
        if (cached)
          return JSON.parse(cached) as {
            weight: string;
            reps: string;
            rir: string;
          };
      } catch {
        /* Primary values still live in IndexedDB. */
      }
      return {
        weight: String(round(kgToDisplay(row.weightKg, unit))),
        reps: String(row.reps),
        rir: row.rir === null ? "" : formatRir(row.rir),
      };
    }),
    [error, setError] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false);
  async function commit(next = fields, patch: Partial<WorkoutSet> = {}) {
    try {
      if (!next.weight.trim() || !next.reps.trim())
        throw Error("重量と回数を入力してください");
      const rir = parseRir(next.rir),
        weightChanged =
          next.weight !== String(round(kgToDisplay(row.weightKg, unit)));
      await saveSetInputs(database, row, {
        weightKg: weightChanged
          ? displayToKg(Number(next.weight), unit)
          : row.weightKg,
        inputUnit: weightChanged ? unit : (row.inputUnit ?? unit),
        inputWeight: weightChanged
          ? Number(next.weight)
          : (row.inputWeight ??
            kgToDisplay(row.weightKg, row.inputUnit ?? unit)),
        reps: Number(next.reps),
        rir,
        rirRaw: next.rir,
        rirConfidence: rir
          ? rir.min === rir.max
            ? "exact"
            : "range"
          : "unknown",
        ...patch,
      });
      try {
        if (localStorage.getItem(key) === JSON.stringify(next))
          localStorage.removeItem(key);
      } catch {
        /* DB has committed. */
      }
      setError("");
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }
  function edit(field: keyof typeof fields, value: string) {
    const next = { ...fields, [field]: value };
    setFields(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      setError("入力途中の補助保存が利用できません");
    }
    void commit(next);
  }
  async function action(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <Fragment>
      <tr className={row.completedAt ? "completed-set" : ""}>
        <td>
          <span className="set-number">SET {index + 1}</span>
          <div className="previous-result">
            {previous ? (
              <>
                {round(kgToDisplay(previous.weightKg, unit))}
                {unit} × {previous.reps}回
                <small>RIR {formatRir(previous.rir)}</small>
              </>
            ) : (
              <span className="muted">記録なし</span>
            )}
          </div>
          <div className="set-actions">
            <label className="set-check">
              <input
                type="checkbox"
                aria-label={`セット${index + 1}を完了`}
                checked={!!row.completedAt}
                onChange={(e) => {
                  const checked = e.target.checked;
                  void action(async () => {
                    if (
                      await commit(fields, {
                        completedAt: checked ? new Date().toISOString() : null,
                      })
                    )
                      if (checked) onCompleted(row.restSeconds ?? 120);
                  });
                }}
              />
              完了
            </label>
            <details>
              <summary aria-label={`セット${index + 1}の操作`}>…</summary>
              <div className="set-menu">
                <button
                  disabled={!canUp}
                  onClick={() => void action(() => onMove(-1))}
                >
                  上へ
                </button>
                <button
                  disabled={!canDown}
                  onClick={() => void action(() => onMove(1))}
                >
                  下へ
                </button>
                <button
                  aria-label={
                    confirmDelete ? "削除を確定" : `セット${index + 1}を削除`
                  }
                  onClick={() => {
                    if (!confirmDelete) {
                      setConfirmDelete(true);
                      return;
                    }
                    void action(() => remove(database, "sets", row));
                  }}
                >
                  {confirmDelete ? "削除を確定" : "削除"}
                </button>
                {confirmDelete && (
                  <button onClick={() => setConfirmDelete(false)}>取消</button>
                )}
              </div>
            </details>
          </div>
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
            onBlur={() => void commit()}
          />
        </td>
        <td>
          <input
            aria-label={`セット${index + 1}の回数`}
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            value={fields.reps}
            onChange={(e) => edit("reps", e.target.value)}
            onBlur={() => void commit()}
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
            onBlur={() => void commit()}
          />
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={4} role="alert" className="error">
            {error}
          </td>
        </tr>
      )}
    </Fragment>
  );
}
