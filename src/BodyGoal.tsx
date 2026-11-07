import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
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
  const unit = profile.units;
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
  const unit = profile.units,
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
        }),
      );
      setMessage("保存しました");
    } catch {
      setMessage("保存できませんでした。もう一度お試しください");
    }
  }
  return (
    <section className="card body-goal">
      <h2>目標に向けた進捗</h2>
      <p className="hint">
        体重の実測値から、最初の測定→目標体重までの変化を表示します。筋肉量や見た目の達成率ではありません。
      </p>
      <form
        className="goal-input"
        onSubmit={(e) => {
          e.preventDefault();
          void persist();
        }}
      >
        <label>
          目標体重 ({unit})
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
      {profile.targetWeightKg === null ? (
        <p className="muted">目標体重を設定すると進捗率を表示します。</p>
      ) : !last ? (
        <p className="muted">トレーニング後の体重を記録すると表示します。</p>
      ) : (
        <>
          <div className="progress-value">
            <strong>{last.progress}%</strong>
            <span>
              {last.weight} → {round(kgToDisplay(profile.targetWeightKg, unit))}
              {unit}
            </span>
          </div>
          <progress
            aria-label="目標体重への進捗"
            max={100}
            value={last.progress ?? 0}
          />
          <div className="chart" role="img" aria-label="目標体重への進捗グラフ">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={points}>
                <CartesianGrid stroke="#323843" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis
                  width={36}
                  domain={[0, 100]}
                  unit="%"
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{ background: "#20252e", color: "#eee" }}
                />
                <Line
                  dataKey="progress"
                  isAnimationActive={false}
                  name="体重目標への進捗 (%)"
                  stroke="var(--accent)"
                  strokeWidth={3}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="hint">
            開始時 {round(kgToDisplay(points[0].kg, unit))}
            {unit}
            。目標に近づくと増加し、遠ざかると低下します。開始点・目標の変更に応じて再計算します。
          </p>
        </>
      )}
    </section>
  );
}
