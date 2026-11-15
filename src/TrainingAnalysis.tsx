import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check, Trophy, ChevronRight } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { AppDB } from "./db";
import {
  type Entities,
  type WorkoutSet,
  kgToDisplay,
  round,
  localDate,
} from "./model";
import { sessionDay } from "./training";
import { trainingStats, workoutWeeks, exerciseKey } from "./training-stats";
import { BodyGoal } from "./BodyGoal";

type AnalysisData = {
  profile: Entities["profiles"];
  sessions: Entities["sessions"][];
  sets: WorkoutSet[];
  wellness: Entities["wellness"][];
  exercises: Entities["exercises"][];
};
export function TrainingAnalysis({
  data,
  database,
}: {
  data: AnalysisData;
  database: AppDB;
}) {
  const [selected, setSelected] = useState(""),
    [days, setDays] = useState(0),
    [metric, setMetric] = useState("weight");
  const now = new Date(),
    stats = trainingStats(data.sessions, data.sets, now),
    unit = data.profile.units;
  const choices = new Map<string, { name: string; equipmentId: string }>();
  for (const s of stats.finished)
    for (const e of s.exercises)
      choices.set(exerciseKey(e.exerciseId, e.equipmentId), e);
  for (const e of data.exercises)
    choices.set(exerciseKey(e.id, e.equipmentId), e);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (days) start.setDate(start.getDate() - days + 1);
  const points = stats.finished
    .filter((s) => !days || sessionDay(s) >= localDate(start))
    .flatMap((s) => {
      const rows = stats.rows.filter(
        (r) =>
          r.sessionId === s.id &&
          exerciseKey(r.exerciseId, r.equipmentId) === selected,
      );
      if (!rows.length) return [];
      return [
        {
          name: sessionDay(s).slice(5).replace("-", "/"),
          weight: round(
            kgToDisplay(Math.max(...rows.map((r) => r.weightKg)), unit),
          ),
          reps: Math.max(...rows.map((r) => r.reps)),
          sets: rows.length,
        },
      ];
    });
  const series = workoutWeeks(stats.finished, now, days),
    updated = stats.bests.filter((b) => b.updated).length;
  const latest = points.at(-1),
    metricUnit =
      metric === "weight" ? unit : metric === "reps" ? "回" : "セット";
  const latestValue = latest?.[metric as "weight" | "reps" | "sets"];
  return (
    <div className="training-analysis">
      <h1 className="analysis-title">分析</h1>
      <section className="hero training-week" aria-label="今週のトレーニング">
        <div className="hero-top">
          <span>今週のトレーニング</span>
          <span className="week-goal">
            {stats.weekly.sessions >= data.profile.targetDaysPerWeek ? (
              <>
                <Check size={14} /> 目標達成
              </>
            ) : (
              `あと${data.profile.targetDaysPerWeek - stats.weekly.sessions}回で目標達成`
            )}
          </span>
        </div>
        <div className="hero-number">
          {stats.weekly.sessions}
          <small> / {data.profile.targetDaysPerWeek} 回</small>
        </div>
        <progress
          aria-label="今週のトレーニング目標"
          max={data.profile.targetDaysPerWeek}
          value={stats.weekly.sessions}
        />
        <div className="training-days">
          {stats.weekDays.map((d) => (
            <div
              key={d.day}
              className={`${d.count ? "trained" : ""} ${d.today ? "today" : ""}`}
            >
              <span>{d.label}</span>
              <b aria-label={`${d.day} ${d.count}回`}>
                {d.count ? <Check size={17} /> : "·"}
              </b>
            </div>
          ))}
        </div>
      </section>
      <div className="training-stat-grid">
        <section className="card training-stat">
          <span>今週のセット</span>
          <strong>
            {stats.weeklySets}
            <small>セット</small>
          </strong>
        </section>
        <section className="card training-stat">
          <span>累計トレーニング</span>
          <strong>
            {stats.total}
            <small>回</small>
          </strong>
        </section>
      </div>
      <Link className="button full analysis-history" to="/history">
        <span>保存したトレーニング記録を確認</span>
        <ChevronRight size={17} />
      </Link>
      {stats.bests.length > 0 && (
        <section className="card personal-bests">
          <div className="analysis-section-title">
            <h2>
              <Trophy size={17} /> 自己ベスト
            </h2>
            {updated > 0 && (
              <span className="record-badge">直近で{updated}種目更新</span>
            )}
          </div>
          {stats.bests.slice(0, 3).map((b) => (
            <BestRow key={b.key} record={b} unit={unit} />
          ))}
          {stats.bests.length > 3 && (
            <details className="more-bests">
              <summary>他の{stats.bests.length - 3}種目</summary>
              {stats.bests.slice(3).map((b) => (
                <BestRow key={b.key} record={b} unit={unit} />
              ))}
            </details>
          )}
        </section>
      )}
      <section className="card analysis-trend">
        <h2>{selected ? "種目の推移" : "トレーニングの積み重ね"}</h2>
        <div className="analysis-filters">
          <label>
            種目・器具
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">トレーニング回数</option>
              {[...choices].map(([key, e]) => (
                <option key={key} value={key}>
                  {e.name} / {e.equipmentId}
                </option>
              ))}
            </select>
          </label>
          <div className="filter">
            <label>
              期間
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                <option value="28">4週</option>
                <option value="84">12週</option>
                <option value="183">6か月</option>
                <option value="0">全期間</option>
              </select>
            </label>
            {selected && (
              <label>
                指標
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value)}
                >
                  <option value="weight">最高重量 ({unit})</option>
                  <option value="reps">最多回数</option>
                  <option value="sets">セット数</option>
                </select>
              </label>
            )}
          </div>
        </div>
        {!selected ? (
          <div
            className="chart"
            role="img"
            aria-label="トレーニング回数の推移グラフ"
          >
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={series}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  width={25}
                  allowDecimals={false}
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
                <Bar
                  name="トレーニング回数"
                  dataKey="count"
                  fill="var(--accent)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : points.length ? (
          <>
            <div className="trend-current">
              <span>
                {metric === "weight"
                  ? "直近の最高重量"
                  : metric === "reps"
                    ? "直近の最多回数"
                    : "直近のセット数"}
              </span>
              <strong>
                {latestValue}
                <small>{metricUnit}</small>
              </strong>
            </div>
            <div className="chart" role="img" aria-label="種目の進捗グラフ">
              <ResponsiveContainer width="100%" height={200}>
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
                    tick={{ fontSize: 10 }}
                    domain={
                      metric === "weight" ? ["auto", "auto"] : [0, "auto"]
                    }
                    allowDecimals={metric === "weight"}
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
                  <Line
                    dataKey={metric}
                    name={metricUnit}
                    stroke="var(--accent)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <p className="analysis-empty">まだ記録がありません</p>
        )}
      </section>
      <BodyGoal
        database={database}
        profile={data.profile}
        wellness={data.wellness}
      />
    </div>
  );
}

function BestRow({
  record: b,
  unit,
}: {
  record: ReturnType<typeof trainingStats>["bests"][number];
  unit: "kg" | "lb";
}) {
  return (
    <div className="best-row">
      <div>
        <b>{b.name}</b>
        {b.equipmentId !== b.name && <small>{b.equipmentId}</small>}
        <small>{b.day.slice(5).replace("-", "/")}</small>
      </div>
      <div className="best-value">
        <strong>
          {round(kgToDisplay(b.weightKg, unit))}
          <small>{unit}</small>
        </strong>
        <span>
          × {b.reps}回{" "}
          {b.updated && <ArrowUpRight size={14} aria-label="自己ベスト更新" />}
        </span>
      </div>
    </div>
  );
}
