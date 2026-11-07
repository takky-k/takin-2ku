import { useEffect, useState, useRef } from "react";
import type { AppDB } from "./db";
import {
  type Entities,
  displayToKg,
  kgToDisplay,
  round,
  localDate,
} from "./model";
import { emptyWellness, saveWellness } from "./wellness";
import { SleepImport, sleepHoursForDate } from "./health";
import { sleepLabel, useSleepState } from "./sleep-sync";
function Scale({
  label,
  value,
  min = 1,
  max = 5,
  low,
  high,
  onChange,
}: {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  low: string;
  high: string;
  onChange: (n: number | null) => void;
}) {
  return (
    <div className={`condition-scale ${value === null ? "unset" : ""}`}>
      <div className="scale-label">
        <label>
          {label}
          <input
            aria-label={label}
            type="range"
            min={min}
            max={max}
            step="1"
            value={value ?? Math.round((min + max) / 2)}
            aria-valuetext={value === null ? "未入力" : String(value)}
            onChange={(e) => onChange(Number(e.target.value))}
            onPointerUp={(e) => onChange(Number(e.currentTarget.value))}
            onKeyUp={(e) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                ].includes(e.key)
              )
                onChange(Number(e.currentTarget.value));
            }}
          />
        </label>
        <output aria-live="polite">{value ?? "未入力"}</output>
      </div>
      <div className="scale-endpoints">
        <span>
          {min}：{low}
        </span>
        <span>
          {max}：{high}
        </span>
      </div>
      {value !== null && (
        <button
          className="clear-scale"
          type="button"
          onClick={() => onChange(null)}
          aria-label={`${label}を未入力に戻す`}
        >
          未入力に戻す
        </button>
      )}
    </div>
  );
}
export function WellnessForm({
  database,
  existing,
  sessionId = null,
  unit,
  health,
  date = localDate(),
  bodyOnly = false,
}: {
  database: AppDB;
  existing?: Entities["wellness"];
  sessionId?: string | null;
  unit: "kg" | "lb";
  health: Entities["health"][];
  date?: string;
  bodyOnly?: boolean;
}) {
  const [draft, setDraft] = useState(
      () => existing ?? emptyWellness(sessionId, date),
    ),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const dirty = useRef(false);
  const sleep = useSleepState();
  useEffect(() => {
    if (existing && !dirty.current) setDraft(existing);
  }, [existing?.id, existing?.revision]);
  const change = (patch: Partial<Entities["wellness"]>) => {
    dirty.current = true;
    setDraft((v) => ({ ...v, ...patch }));
    setMessage("");
  };
  const hours = sleepHoursForDate(health, date);
  async function commit() {
    setSaving(true);
    try {
      const saved = await saveWellness(database, {
        ...draft,
        sleepHours: hours ?? draft.sleepHours,
        sleepStatus: hours === null ? "not-acquired" : "available",
      });
      setDraft(saved);
      dirty.current = false;
      setMessage("保存しました");
    } catch (e) {
      setMessage(`保存できませんでした：${String(e)}`);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="wellness-form">
      {!bodyOnly && (
        <>
          <Scale
            label="気分"
            value={draft.mood}
            low="とても悪い"
            high="とても良い"
            onChange={(mood) => change({ mood })}
          />
          <Scale
            label="全身の筋肉疲労"
            value={draft.fatigue}
            low="疲れていない"
            high="最も疲れている"
            onChange={(fatigue) => change({ fatigue })}
          />
          <div className="soreness-scales">
            {["胸", "背中", "肩", "腕"].map((m) => (
              <Scale
                key={m}
                label={`${m}の筋肉痛`}
                min={0}
                value={draft.sorenessByMuscle[m] ?? null}
                low="筋肉痛なし"
                high="最も強い筋肉痛"
                onChange={(n) => {
                  const soreness = { ...draft.sorenessByMuscle };
                  if (n === null) delete soreness[m];
                  else soreness[m] = n;
                  change({ sorenessByMuscle: soreness });
                }}
              />
            ))}
          </div>
          <div className="sleep-reading">
            <span>睡眠</span>
            <b>{sleepLabel(sleep.status, hours)}</b>
          </div>
          {sleep.updating && (
            <p className="hint" role="status">
              睡眠データを確認中…
            </p>
          )}
          {sleep.status === "error" && hours !== null && (
            <p className="hint">
              保存済みの睡眠：{Math.floor(hours)}時間
              {Math.round(hours * 60) % 60}分
            </p>
          )}
          <SleepImport database={database} compact />
        </>
      )}
      {bodyOnly && (
        <label>
          体重 ({unit})
          <input
            inputMode="decimal"
            type="number"
            min="1"
            step="any"
            value={
              draft.bodyWeightKg === null
                ? ""
                : round(kgToDisplay(draft.bodyWeightKg, unit))
            }
            onChange={(e) =>
              change({
                bodyWeightKg: e.target.value
                  ? displayToKg(Number(e.target.value), unit)
                  : null,
              })
            }
          />
        </label>
      )}
      {!bodyOnly && (
        <label>
          体調メモ
          <textarea
            value={draft.notes}
            onChange={(e) => change({ notes: e.target.value })}
          />
        </label>
      )}
      <button
        type="button"
        className="primary full"
        disabled={saving}
        onClick={() => void commit()}
      >
        {saving ? "保存中…" : "保存"}
      </button>
      <p role="status" className="save-status">
        {message}
      </p>
    </div>
  );
}
