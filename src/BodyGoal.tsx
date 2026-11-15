import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { type AppDB, save, revised } from "./db";
import { type Entities, displayToKg, kgToDisplay, round } from "./model";
import { bodyWeightProgress } from "./progress";
export function BodyGoal({
  database,
  profile,
  wellness,
}: {
  database: AppDB;
  profile: Entities["profiles"];
  wellness: Entities["wellness"][];
}) {
  const unit = "kg";
  return (
    <BodyGoalForm
      key={unit + ":" + profile.targetWeightKg}
      database={database}
      profile={profile}
      wellness={wellness}
    />
  );
}
function BodyGoalForm({
  database,
  profile,
  wellness,
}: {
  database: AppDB;
  profile: Entities["profiles"];
  wellness: Entities["wellness"][];
}) {
  const unit = "kg",
    [input, setInput] = useState(
      profile.targetWeightKg === null
        ? ""
        : String(round(kgToDisplay(profile.targetWeightKg, unit))),
    ),
    [message, setMessage] = useState("");
  const points = bodyWeightProgress(wellness, profile.targetWeightKg).map(
      (p) => ({
        ...p,
        weight: round(kgToDisplay(p.kg, unit)),
        name: p.day.slice(5).replace("-", "/"),
      }),
    ),
    last = points.at(-1);
  async function persist() {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    if (
      input.trim() &&
      (!Number.isFinite(Number(input)) ||
        Number(input) <= 0 ||
        displayToKg(Number(input), unit) > 500)
    ) {
      setMessage("目標体重を確認してください");
      return;
    }
    try {
      const current = await database.profiles.get(profile.id);
      if (!current) throw Error("設定を読み込めません");
      await save(
        database,
        "profiles",
        revised({
          ...current,
          targetWeightKg: input.trim()
            ? displayToKg(Number(input), unit)
            : null,
          bodyWeightUnitVersion: 1,
        }),
      );
      setMessage("保存しました");
    } catch {
      setMessage("保存できませんでした。もう一度お試しください");
    }
  }
  return (
    <section className="card body-goal">
      <h2>体重</h2>
      <div className="body-weight-summary">
        <div>
          <span>現在</span>
          <strong>
            {last?.weight ?? "—"}
            <small>kg</small>
          </strong>
        </div>
        {last && profile.targetWeightKg !== null && (
          <div>
            <span>目標まで</span>
            <strong>
              {round(Math.abs(last.kg - profile.targetWeightKg))}
              <small>kg</small>
            </strong>
          </div>
        )}
      </div>
      {points.length > 0 && (
        <div className="chart" role="img" aria-label="体重の推移グラフ">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={points}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                width={35}
                domain={[
                  (dataMin: number) =>
                    Math.min(dataMin, profile.targetWeightKg ?? dataMin) - 1,
                  (dataMax: number) =>
                    Math.max(dataMax, profile.targetWeightKg ?? dataMax) + 1,
                ]}
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  borderRadius: 10,
                }}
              />
              {profile.targetWeightKg !== null && (
                <ReferenceLine
                  y={profile.targetWeightKg}
                  stroke="var(--muted)"
                  strokeDasharray="4 4"
                />
              )}
              <Line
                dataKey="weight"
                name="体重 (kg)"
                stroke="var(--accent)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <form
        className="goal-input"
        onSubmit={(e) => {
          e.preventDefault();
          void persist();
        }}
      >
        <label>
          目標体重 (kg)
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>
        <button type="submit">保存</button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
