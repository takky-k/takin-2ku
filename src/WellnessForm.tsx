import { useEffect, useState, useRef } from "react";
import type { AppDB } from "./db";
import { type Entities, round, localDate } from "./model";
import { emptyWellness, saveWellness, conditionMuscles } from "./wellness";
import { SleepImport, sleepHoursForDate } from "./health";
import { sleepLabel, useSleepState } from "./sleep-sync";
import { readBodyWeightDraft, stageBodyWeight } from "./body-weight-draft";
function Scale({
  label,
  value,
  min = 1,
  max = 5,
  step = 1,
  unit = "",
  low,
  high,
  onChange,
}: {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
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
            step={step}
            value={value ?? Math.round((min + max) / 2)}
            aria-valuetext={value === null ? "未入力" : `${value}${unit}`}
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
        <output aria-live="polite">
          {value === null ? "未入力" : `${value}${unit}`}
        </output>
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
  health,
  date = localDate(),
  bodyOnly = false,
  deferBodySave = false,
  plans = [],
  exercises = [],
  requestedPlanId,
  onSaved,
}: {
  database: AppDB;
  existing?: Entities["wellness"];
  sessionId?: string | null;
  unit: "kg" | "lb";
  health: Entities["health"][];
  date?: string;
  bodyOnly?: boolean;
  deferBodySave?: boolean;
  plans?: Entities["plans"][];
  exercises?: Entities["exercises"][];
  requestedPlanId?: string;
  onSaved?: (saved: Entities["wellness"]) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(() => {
      const base = existing ?? emptyWellness(sessionId, date);
      const raw =
        deferBodySave && sessionId
          ? readBodyWeightDraft(database, sessionId)
          : null;
      return raw === null
        ? base
        : { ...base, bodyWeightKg: raw.trim() ? Number(raw) : null };
    }),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const dirty = useRef(
      !!(
        deferBodySave &&
        sessionId &&
        readBodyWeightDraft(database, sessionId) !== null
      ),
    ),
    committing = useRef(false);
  const sleep = useSleepState();
  useEffect(() => {
    if (existing && !dirty.current) setDraft(existing);
  }, [existing?.id, existing?.revision]);
  const change = (patch: Partial<Entities["wellness"]>) => {
    dirty.current = true;
    setDraft((v) => ({ ...v, ...patch }));
    setMessage("");
  };
  useEffect(() => {
    if (
      !bodyOnly &&
      requestedPlanId &&
      plans.some((p) => p.id === requestedPlanId)
    ) {
      setDraft((d) => ({ ...d, plannedPlanId: requestedPlanId }));
      dirty.current = true;
    }
  }, [requestedPlanId, !!plans.length]);
  const selectedPlan = plans.find((p) => p.id === draft.plannedPlanId),
    muscles = selectedPlan ? conditionMuscles(selectedPlan, exercises) : [];
  const hours = sleepHoursForDate(health, date);
  const manualSleep = draft.explicitInputFlags?.sleepHours === true;
  async function commit() {
    if (committing.current) return;
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    committing.current = true;
    setSaving(true);
    try {
      const saved = await saveWellness(database, {
        ...draft,
        ...(!bodyOnly && selectedPlan
          ? { conditionReferenceMuscle: muscles[0] }
          : {}),
        ...(!bodyOnly ? { fatigueByMuscle: draft.fatigueByMuscle ?? {} } : {}),
        ...(!bodyOnly
          ? {
              sleepHours: manualSleep
                ? draft.sleepHours
                : (hours ?? draft.sleepHours),
              sleepStatus:
                (manualSleep
                  ? draft.sleepHours
                  : (hours ?? draft.sleepHours)) === null
                  ? ("not-acquired" as const)
                  : ("available" as const),
            }
          : {}),
      });
      setDraft(saved);
      dirty.current = false;
      setMessage("保存しました");
      try {
        await onSaved?.(saved);
      } catch (e) {
        setMessage(
          `コンディションは保存済みです。記録を開始できません：${e instanceof Error ? e.message : String(e)}`,
        );
      }
    } catch (e) {
      setMessage(`保存できませんでした：${String(e)}`);
    } finally {
      committing.current = false;
      setSaving(false);
    }
  }
  return (
    <div className="wellness-form">
      {!bodyOnly && (
        <>
          <label>
            今日のメニュー
            <select
              value={draft.plannedPlanId ?? ""}
              onChange={(e) =>
                change({ plannedPlanId: e.target.value || null })
              }
            >
              <option value="">A/Bなどのメニューを選択</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <Scale
            label="体調"
            value={draft.mood}
            low="とても悪い"
            high="とても良い"
            onChange={(mood) => change({ mood })}
          />
          {!selectedPlan && (
            <p className="hint">
              メニューを選ぶと、主な部位と全身の筋肉痛を表示します。
            </p>
          )}
          <div className="soreness-scales">
            {muscles.map((m) => (
              <Scale
                key={m}
                label={m + "の筋肉痛"}
                value={draft.sorenessByMuscle[m] ?? null}
                low="筋肉痛なし"
                high="とても強い"
                onChange={(n) => {
                  const values = { ...draft.sorenessByMuscle };
                  if (n === null) delete values[m];
                  else values[m] = n;
                  change({ sorenessByMuscle: values });
                }}
              />
            ))}
          </div>
          {selectedPlan && (
            <p className="hint">
              他の部位は、主な部位と全身の筋肉痛を目安に調整します。
            </p>
          )}
          <Scale
            label="睡眠時間"
            min={0}
            max={12}
            step={0.5}
            unit="時間"
            value={manualSleep ? draft.sleepHours : null}
            low="睡眠なし"
            high="12時間"
            onChange={(sleepHours) =>
              change({
                sleepHours,
                explicitInputFlags: {
                  ...draft.explicitInputFlags,
                  sleepHours: sleepHours !== null,
                },
              })
            }
          />
          <p className="hint">
            0.5時間刻み。手入力した場合は取込データより優先します。未入力に戻すと取込データを使用します。
          </p>
          <div className="sleep-reading">
            <span>ショートカットの睡眠</span>
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
          体重 (kg)
          <input
            inputMode="decimal"
            type="number"
            min="1"
            step="any"
            value={draft.bodyWeightKg === null ? "" : round(draft.bodyWeightKg)}
            onChange={(e) => {
              if (deferBodySave && sessionId)
                stageBodyWeight(database, sessionId, e.target.value);
              change({
                bodyWeightKg: e.target.value ? Number(e.target.value) : null,
                bodyWeightUnitVersion: 1,
              });
            }}
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
      {deferBodySave ? (
        <p className="hint">スマホ財布を取って、靴脱いで測定</p>
      ) : (
        <button
          type="button"
          className="primary full"
          disabled={saving}
          onClick={() => void commit()}
        >
          {saving ? "保存中…" : "保存"}
        </button>
      )}
      <p role="status" className="save-status">
        {message}
      </p>
    </div>
  );
}
