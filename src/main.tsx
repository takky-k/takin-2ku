import React, { useEffect, useState } from "react";
import { HashRouter, NavLink, Route, Routes, Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Activity,
  CalendarDays,
  ChartNoAxesCombined,
  House,
  Settings as SettingsIcon,
  Sparkles,
  Plus,
  Check,
  ArrowUp,
  ArrowDown,
  Trash2,
  Copy,
  Play,
  Download,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  db,
  demoDb,
  seed,
  meta,
  save,
  revised,
  remove,
  deleteSession,
  exportBackup,
  parseBackup,
  importBackup,
  type AppDB,
  type Backup,
} from "./db";
import {
  type Entities,
  type WorkoutSet,
  parseRir,
  formatRir,
  kgToDisplay,
  displayToKg,
  round,
  localDate,
} from "./model";
import { epley, weeklySummary, suggest } from "./analysis";
import { useUI } from "./store";
import "./style.css";
import { PlanEditor } from "./PlanEditor";
import { CsvImport } from "./CsvImport";
import { installDefaultPlans } from "./db";
import {
  startWorkout,
  sessionDay,
  comparison,
  finishWorkout,
} from "./training";
import { AdvicePanel } from "./AdvicePanel";

const text = {
  ja: {
    today: "今日",
    history: "履歴",
    analysis: "分析",
    ai: "AI",
    settings: "設定",
  },
};
const alive = <T extends { deletedAt: string | null }>(rows: T[]) =>
  rows.filter((r) => !r.deletedAt);
function useData() {
  const demo = useUI((s) => s.demo),
    database = demo ? demoDb : db;
  const data = useLiveQuery(
    async () => ({
      exercises: alive(await database.exercises.toArray()),
      plans: alive(await database.plans.toArray()).sort((a, b) =>
        (a.catalogKey ?? a.name).localeCompare(b.catalogKey ?? b.name),
      ),
      sessions: alive(await database.sessions.toArray()),
      sets: alive(await database.sets.toArray()),
      wellness: alive(await database.wellness.toArray()),
      recommendations: alive(await database.recommendations.toArray()),
      profile: await database.profiles.get("main"),
      pending: await database.queue.count(),
    }),
    [demo],
  );
  return { database, data };
}
function run(action: () => Promise<unknown>) {
  void action().catch((e) =>
    useUI
      .getState()
      .setError(
        `保存できませんでした。入力を控え、バックアップを確認してください。${String(e)}`,
      ),
  );
}
const date = (s: string) =>
  new Date(s).toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
export function App() {
  const { data, database } = useData(),
    { demo, toggleDemo, error, setError } = useUI(),
    [online, setOnline] = useState(navigator.onLine),
    [storage, setStorage] = useState("確認中");
  const {
    needRefresh: [refresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    run(async () => {
      await seed(db);
      await seed(demoDb, true);
      setStorage(
        navigator.storage?.persisted && (await navigator.storage.persisted())
          ? "永続領域"
          : "ブラウザー管理領域",
      );
    });
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = data?.profile?.theme ?? "dark";
  }, [data?.profile?.theme]);
  return (
    <>
      <header>
        <Link to="/" className="brand">
          <span className="brand-icon">
            <Activity size={22} />
          </span>
          takin' 2ku<span className="phase">LOCAL</span>
        </Link>
        <div className="status">
          <span className={online ? "dot" : "dot offline"} />
          {online ? "ローカル保存・未同期" : "オフライン"} ·{" "}
          {data?.pending ?? 0}件
        </div>
        <Link className="settings-link" aria-label="設定" to="/settings">
          <SettingsIcon size={20} />
        </Link>
      </header>
      <main>
        <div className="mode-strip">
          <span>
            {demo ? "デモ専用データを表示中" : "あなたのペースで、積み重ねる。"}
          </span>
          <button onClick={toggleDemo}>
            {demo ? "実データに戻る" : "デモを見る"}
          </button>
        </div>
        {error && (
          <div role="alert" className="notice danger">
            {error}
            <button onClick={() => setError("")}>閉じる</button>
          </div>
        )}
        {refresh && (
          <div className="notice">
            更新があります。入力は保存済みです。
            <button
              disabled={data?.sessions.some((s) => s.status === "active")}
              onClick={() => void updateServiceWorker(true)}
            >
              更新する
            </button>
            {data?.sessions.some((s) => s.status === "active") &&
              "トレーニング終了後に更新できます。"}
          </div>
        )}
        {data?.sessions.some((s) => s.status === "active") && (
          <Link className="resume-strip" to="/workout">
            進行中のトレーニングに戻る →
          </Link>
        )}
        <Routes key={database.name}>
          <Route path="/" element={<Today />} />
          <Route path="/workout" element={<Workout />} />
          <Route path="/history" element={<History />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/ai" element={<Advice />} />
          <Route path="/settings" element={<Settings storage={storage} />} />
          <Route path="*" element={<Today />} />
        </Routes>
      </main>
      <nav aria-label="メインナビゲーション">
        {[
          [House, "/", text.ja.today],
          [Activity, "/workout", "記録"],
          [CalendarDays, "/history", text.ja.history],
          [ChartNoAxesCombined, "/analysis", text.ja.analysis],
          [Sparkles, "/ai", text.ja.ai],
        ].map(([Icon, path, label]) => {
          const I = Icon as typeof House;
          return (
            <NavLink key={String(path)} end to={String(path)}>
              <I size={22} />
              <span>{String(label)}</span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}
function Title({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="title-row">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
function Today() {
  const { database, data } = useData();
  const [editing, setEditing] = useState<Entities["plans"] | null>(null),
    [checkin, setCheckin] = useState(false);
  if (!data?.profile) return <p>ローカルデータを準備中…</p>;
  const active = data.sessions.find((s) => s.status === "active"),
    weekly = weeklySummary(data.sessions, data.sets);
  const latest = data.sessions
    .filter((s) => s.status === "finished")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  async function start(p: Entities["plans"]) {
    await startWorkout(database, p, data!.profile!.units);
    location.hash = "/workout";
  }
  return (
    <>
      <Title
        eyebrow={new Date().toLocaleDateString("ja-JP", {
          month: "long",
          day: "numeric",
          weekday: "long",
        })}
        title="今日も、一歩ずつ。"
      >
        <span className="tag">{data.profile.goal}</span>
      </Title>
      <section className="hero">
        <div className="hero-top">
          <span>今週のトレーニング</span>
          <Activity size={21} />
        </div>
        <div className="hero-number">
          {weekly.sessions}
          <small> / {data.profile.targetDaysPerWeek} 回</small>
        </div>
        <progress
          max={data.profile.targetDaysPerWeek}
          value={weekly.sessions}
        />
        <p>積み重ねた記録が、次の一歩になる。</p>
      </section>
      <div className="section-heading">
        <h2>今日のコンディション</h2>
        <button onClick={() => setCheckin(!checkin)}>チェックイン</button>
      </div>
      {checkin ? (
        <WellnessEditor />
      ) : (
        <section className="card muted">
          疲労・筋肉痛の入力は任意です。睡眠：未取得。
        </section>
      )}
      {active && (
        <Link className="button primary full" to="/workout">
          <Play size={18} />
          トレーニングを再開
        </Link>
      )}
      <div className="section-heading">
        <h2>マイメニュー</h2>
        <button
          onClick={() =>
            setEditing({
              ...meta(),
              name: "新しいメニュー",
              dayLabel: "",
              exercises: [],
            })
          }
        >
          <Plus size={18} />
          作成
        </button>
      </div>
      {data.plans.map((p) => (
        <section className="card" key={p.id}>
          <span className="eyebrow">
            {p.dayLabel || "曜日・部位は自由に設定"}
          </span>
          <h3>{p.name}</h3>
          <p className="muted">
            {p.exercises.length}種目 ·{" "}
            {p.exercises.reduce((a, e) => a + e.targetSets, 0)}セット
          </p>
          <div className="exercise-tags">
            {p.exercises.map((e) => (
              <span key={e.exerciseId}>
                {data.exercises.find((x) => x.id === e.exerciseId)?.name}
              </span>
            ))}
          </div>
          <div className="actions">
            <button
              className="primary"
              disabled={!!active || !p.exercises.length}
              onClick={() => run(() => start(p))}
            >
              <Play size={17} />
              開始する
            </button>
            <button onClick={() => setEditing(p)}>編集</button>
            <button
              aria-label={`${p.name}を複製`}
              onClick={() =>
                run(() =>
                  save(database, "plans", {
                    ...p,
                    ...meta(),
                    name: p.name + " コピー",
                  }),
                )
              }
            >
              <Copy size={18} />
            </button>
          </div>
        </section>
      ))}
      {editing && (
        <PlanEditor
          plan={editing}
          database={database}
          exercises={data.exercises}
          unit={data.profile.units}
          close={() => setEditing(null)}
        />
      )}
      <h2>直近のトレーニング</h2>
      {latest ? (
        <Link to="/history" className="card history-link">
          <span>
            <b>{latest.name}</b>
            <small>{date(sessionDay(latest) + "T12:00:00")}</small>
          </span>
          <span>詳細 →</span>
        </Link>
      ) : (
        <section className="card muted">
          まだ記録がありません。メニューを選んで始めましょう。
        </section>
      )}
    </>
  );
}
function previousSets(
  sessions: Entities["sessions"][],
  sets: WorkoutSet[],
  exerciseId: string,
  exclude?: string,
  equipmentId?: string,
) {
  const s = sessions
    .filter(
      (s) =>
        s.id !== exclude &&
        !s.deletedAt &&
        s.status === "finished" &&
        sets.some(
          (x) =>
            x.sessionId === s.id &&
            x.exerciseId === exerciseId &&
            (!equipmentId || x.equipmentId === equipmentId) &&
            x.completedAt &&
            !x.deletedAt,
        ),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  return s
    ? sets
        .filter(
          (x) =>
            x.sessionId === s.id &&
            x.exerciseId === exerciseId &&
            (!equipmentId || x.equipmentId === equipmentId) &&
            x.completedAt &&
            !x.deletedAt,
        )
        .sort((a, b) => a.ordinal - b.ordinal)
    : [];
}
function Workout() {
  const { data, database } = useData();
  const [finishing, setFinishing] = useState(false);
  const s = data?.sessions.find((s) => s.status === "active");
  return (
    <>
      <Title eyebrow="TRAINING" title="トレーニング" />
      {s ? (
        <>
          <SessionEditor session={s} />
          <section className="card">
            <h2>トレーニング後の体重</h2>
            <WellnessEditor sessionId={s.id} />
            <button className="primary full" onClick={() => setFinishing(true)}>
              トレーニングを終了
            </button>
            {finishing && (
              <div
                role="dialog"
                aria-label="トレーニング完了の確認"
                className="notice"
              >
                <h3>今回の記録を確認</h3>
                <p>
                  {
                    data!.sets.filter(
                      (r) => r.sessionId === s.id && r.completedAt,
                    ).length
                  }
                  セット完了。未完了のセットは実績・分析に含みません。
                </p>
                <p className="hint">Apple Healthへの書き込みは行いません。</p>
                <div className="actions">
                  <button
                    className="primary"
                    disabled={
                      !data!.sets.some(
                        (r) => r.sessionId === s.id && r.completedAt,
                      )
                    }
                    onClick={() =>
                      run(async () => {
                        await finishWorkout(database, s.id);
                        setFinishing(false);
                      })
                    }
                  >
                    完了を確定
                  </button>
                  <button onClick={() => setFinishing(false)}>
                    記録に戻る
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="card">
          <h2>今日のメニューを選ぶ</h2>
          <p>実施日は自由に選べます。予定値を確認して始めましょう。</p>
          {data?.plans.map((p) => (
            <button
              className="full"
              key={p.id}
              onClick={() =>
                run(() =>
                  startWorkout(database, p, data.profile?.units ?? "lb"),
                )
              }
            >
              {p.name}を開始
            </button>
          ))}
          <Link className="button primary" to="/">
            今日のメニューへ
          </Link>
        </section>
      )}
    </>
  );
}
function SessionEditor({ session: s }: { session: Entities["sessions"] }) {
  const { data, database } = useData();
  const lastDeleted = useLiveQuery(
    async () =>
      (await database.sets.where("sessionId").equals(s.id).toArray())
        .filter(
          (r) =>
            r.deletedAt &&
            s.exercises.some((e) => e.exerciseId === r.exerciseId),
        )
        .sort((a, b) =>
          (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""),
        )[0],
    [database, s.id, s.revision],
  );
  const [until, setUntil] = useState(
      () => Number(localStorage.getItem("takin-rest-" + s.id)) || 0,
    ),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  if (!data?.profile) return null;
  const unit = data.profile.units;
  async function moveExercise(i: number, delta: number) {
    const items = [...s.exercises];
    [items[i], items[i + delta]] = [items[i + delta], items[i]];
    await save(database, "sessions", revised({ ...s, exercises: items }));
  }
  async function addSet(exerciseId: string) {
    const rows = data!.sets
        .filter((r) => r.sessionId === s.id && r.exerciseId === exerciseId)
        .sort((a, b) => a.ordinal - b.ordinal),
      last = rows.at(-1);
    await save(database, "sets", {
      ...meta(),
      sessionId: s.id,
      exerciseId,
      equipmentId: s.exercises.find((e) => e.exerciseId === exerciseId)!
        .equipmentId,
      ordinal: (last?.ordinal ?? -1) + 1,
      setType: last?.setType ?? "normal",
      weightKg: last?.weightKg ?? 0,
      reps: last?.reps ?? 8,
      rir: null,
      targetRir: last?.targetRir ?? null,
      inputUnit: unit,
      inputWeight: kgToDisplay(last?.weightKg ?? 0, unit),
      loadMode: last?.loadMode ?? "unknown",
      rpe: null,
      completedAt: null,
      notes: "",
      restSeconds:
        data!.exercises.find((e) => e.id === exerciseId)?.defaultRestSeconds ??
        120,
    });
  }
  const timer = (seconds: number) => {
    const end = Date.now() + seconds * 1000;
    localStorage.setItem("takin-rest-" + s.id, String(end));
    setUntil(end);
  };
  return (
    <>
      <section className="session-heading">
        <h2>{s.name}</h2>
        <span className="tag">
          {s.status === "active" ? "記録中 · 自動保存" : "保存済み"}
        </span>
      </section>
      {s.generalNotes && (
        <section className="card">
          <h3>メニュー共通メモ</h3>
          <p>{s.generalNotes}</p>
        </section>
      )}
      {s.status === "active" && (
        <Link className="button full" to="/ai">
          開始前の提案を確認（承認するまで予定は変更しません）
        </Link>
      )}
      <p className="hint">
        RIR =
        あと何回挙げられたか。0は限界、空欄は未入力。範囲（1〜2）・0.5刻みに対応。
      </p>
      {s.exercises.map((e, i) => {
        const rows = data.sets
            .filter(
              (r) => r.sessionId === s.id && r.exerciseId === e.exerciseId,
            )
            .sort((a, b) => a.ordinal - b.ordinal),
          prev = previousSets(
            data.sessions,
            data.sets,
            e.exerciseId,
            s.id,
            e.equipmentId,
          );
        const comparisons = comparison(
          data.sessions,
          data.sets,
          e.exerciseId,
          e.equipmentId,
          new Date(s.startedAt),
          s.id,
        );
        const form = data.exercises.find((x) => x.id === e.exerciseId);
        const otherMachine = data.exercises.find(
          (x) =>
            x.id !== e.exerciseId &&
            x.name === e.name &&
            x.equipmentId !== e.equipmentId,
        );
        const otherHistory = otherMachine
          ? previousSets(
              data.sessions,
              data.sets,
              otherMachine.id,
              s.id,
              otherMachine.equipmentId,
            )
          : [];
        return (
          <section className="card exercise-card" key={e.exerciseId}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  {String(i + 1).padStart(2, "0")} / {e.muscle}
                </span>
                <h2>{e.name}</h2>
                <small className="muted">{e.equipmentId || "器具未指定"}</small>
              </div>
              <div className="actions compact">
                <button
                  disabled={i === 0}
                  aria-label={`${e.name}を上へ`}
                  onClick={() => run(() => moveExercise(i, -1))}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  disabled={i === s.exercises.length - 1}
                  aria-label={`${e.name}を下へ`}
                  onClick={() => run(() => moveExercise(i, 1))}
                >
                  <ArrowDown size={16} />
                </button>
              </div>
            </div>
            <aside
              className="evergreen-notes"
              aria-label={`${e.name}の永続フォームメモ`}
            >
              <b>フォームメモ</b>
              <p>
                {e.evergreenNotes ??
                  form?.evergreenNotes ??
                  "未登録。設定から自由に追記できます。"}
              </p>
              {form?.formVideoUrls?.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  フォーム動画 ↗
                </a>
              ))}
              <small>
                本人のメモ。医学的な効果を保証するものではありません。
              </small>
            </aside>
            <p className="previous">
              前回：
              {prev.length
                ? prev
                    .map(
                      (p) =>
                        `${round(kgToDisplay(p.weightKg, unit))}${unit} × ${p.reps}回 / RIR ${formatRir(p.rir)}`,
                    )
                    .join(" ｜ ")
                : "記録なし"}
            </p>
            {!prev.length && otherHistory.length > 0 && (
              <p className="notice">
                機種・重量基準が異なる/未確認の参考履歴：
                {otherHistory
                  .map(
                    (p) =>
                      `${round(p.inputWeight ?? kgToDisplay(p.weightKg, p.inputUnit ?? unit))}${p.inputUnit ?? unit} × ${p.reps}回 / RIR ${formatRir(p.rir)}`,
                  )
                  .join("、")}
                。現在の機器の負荷へ換算せず、予定の初期値には自動適用しません。
              </p>
            )}
            <p className="hint">
              前回実施：
              {comparisons.previous
                ? date(sessionDay(comparisons.previous) + "T12:00:00")
                : "同じ機器の記録なし"}{" "}
              / 前週同曜日：
              {comparisons.sameSlot
                ? date(sessionDay(comparisons.sameSlot) + "T12:00:00")
                : "記録なし"}
            </p>
            <label>
              今回の種目メモ
              <input
                value={e.notes}
                onChange={(ev) =>
                  run(() =>
                    save(
                      database,
                      "sessions",
                      revised({
                        ...s,
                        exercises: s.exercises.map((x) =>
                          x.exerciseId === e.exerciseId
                            ? { ...x, notes: ev.target.value }
                            : x,
                        ),
                      }),
                    ),
                  )
                }
              />
            </label>
            {rows.map((row, n) => (
              <SetEditor
                key={row.id}
                row={row}
                index={n}
                unit={unit}
                previous={prev[n]}
                completed={() =>
                  timer(row.restSeconds ?? form?.defaultRestSeconds ?? 120)
                }
                move={async (delta) => {
                  const other = rows[n + delta];
                  if (other)
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
                }}
                canUp={n > 0}
                canDown={n < rows.length - 1}
              />
            ))}
            <div className="actions">
              <button
                className="full"
                onClick={() => run(() => addSet(e.exerciseId))}
              >
                <Plus size={18} />
                セットを追加
              </button>
              <button
                aria-label={`${e.name}を削除`}
                onClick={() => {
                  if (confirm("種目とこのセッション内のセットを削除しますか？"))
                    run(async () => {
                      await database.transaction(
                        "rw",
                        [database.sessions, database.sets, database.queue],
                        async () => {
                          for (const row of rows)
                            await remove(database, "sets", row);
                          await save(
                            database,
                            "sessions",
                            revised({
                              ...s,
                              exercises: s.exercises.filter(
                                (x) => x.exerciseId !== e.exerciseId,
                              ),
                            }),
                          );
                        },
                      );
                    });
                }}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </section>
        );
      })}
      <section className="card">
        <label>
          種目を追加
          <select
            value=""
            onChange={(e) => {
              const x = data.exercises.find((x) => x.id === e.target.value);
              if (x)
                run(() =>
                  save(
                    database,
                    "sessions",
                    revised({
                      ...s,
                      exercises: [
                        ...s.exercises,
                        {
                          exerciseId: x.id,
                          name: x.name,
                          muscle: x.muscle,
                          equipmentId: x.equipmentId,
                          notes: "",
                          evergreenNotes: x.evergreenNotes ?? x.notes,
                          measurementBasis: x.measurementBasis,
                        },
                      ],
                    }),
                  ),
                );
            }}
          >
            <option value="">種目を選択</option>
            {data.exercises
              .filter((e) => !s.exercises.some((x) => x.exerciseId === e.id))
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} / {e.equipmentId}
                </option>
              ))}
          </select>
        </label>
        <label>
          セッションメモ
          <input
            value={s.notes}
            onChange={(e) =>
              run(() =>
                save(
                  database,
                  "sessions",
                  revised({ ...s, notes: e.target.value }),
                ),
              )
            }
          />
        </label>
      </section>
      {lastDeleted && (
        <button
          className="full"
          onClick={() =>
            run(async () => {
              const ordinal =
                Math.max(
                  -1,
                  ...data.sets
                    .filter(
                      (r) =>
                        r.sessionId === s.id &&
                        r.exerciseId === lastDeleted.exerciseId,
                    )
                    .map((r) => r.ordinal),
                ) + 1;
              await save(
                database,
                "sets",
                revised({ ...lastDeleted, deletedAt: null, ordinal }),
              );
            })
          }
        >
          直前のセット削除を元に戻す
        </button>
      )}
      <div className="timer">
        <span>
          休憩 <b>{Math.ceil(Math.max(0, until - now) / 1000)}秒</b>
        </span>
        <button onClick={() => timer(120)}>2分</button>
        <button onClick={() => timer(180)}>3分</button>
        <button aria-label="タイマー停止" onClick={() => timer(0)}>
          停止
        </button>
        <span role="status" className="sr-only">
          {until > 0 && until <= now ? "休憩終了" : ""}
        </span>
      </div>
    </>
  );
}
function SetEditor({
  row,
  index,
  unit,
  previous,
  completed,
  move,
  canUp,
  canDown,
}: {
  row: WorkoutSet;
  index: number;
  unit: "kg" | "lb";
  previous?: WorkoutSet;
  completed: () => void;
  move: (d: number) => Promise<void>;
  canUp: boolean;
  canDown: boolean;
}) {
  const { database } = useData(),
    [error, setError] = useState(""),
    [deleted, setDeleted] = useState(false),
    [askRir, setAskRir] = useState(false);
  const draftKey = `takin-draft-${database.name}-${row.id}-${unit}`;
  const [draft, setDraft] = useState(() => {
    try {
      const cached = localStorage.getItem(draftKey);
      if (cached)
        return JSON.parse(cached) as {
          weight: string;
          reps: string;
          rir: string;
        };
    } catch {
      /* DB remains primary store */
    }
    return {
      weight: String(round(kgToDisplay(row.weightKg, unit))),
      reps: String(row.reps),
      rir: row.rir === null ? "" : formatRir(row.rir),
    };
  });
  const { weight, reps, rir } = draft;
  const edit = (key: keyof typeof draft, value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    try {
      localStorage.setItem(draftKey, JSON.stringify(next));
    } catch {
      setError(
        "入力途中の補助保存が利用できません。完了後に保存状態を確認してください。",
      );
    }
    void commit({}, next);
  };
  const commit = async (patch: Partial<WorkoutSet> = {}, fields = draft) => {
    try {
      const parsedRir = parseRir(fields.rir);
      const next = {
        ...row,
        weightKg:
          fields.weight === String(round(kgToDisplay(row.weightKg, unit)))
            ? row.weightKg
            : displayToKg(Number(fields.weight), unit),
        reps: Number(fields.reps),
        rir: parsedRir,
        rirRaw: fields.rir,
        rirConfidence: parsedRir
          ? parsedRir.min === parsedRir.max
            ? ("exact" as const)
            : ("range" as const)
          : ("unknown" as const),
        inputUnit:
          fields.weight === String(round(kgToDisplay(row.weightKg, unit)))
            ? (row.inputUnit ?? unit)
            : unit,
        inputWeight:
          fields.weight === String(round(kgToDisplay(row.weightKg, unit)))
            ? (row.inputWeight ??
              kgToDisplay(row.weightKg, row.inputUnit ?? unit))
            : Number(fields.weight),
        ...patch,
      };
      if (fields.weight.trim() === "" || fields.reps.trim() === "")
        throw Error("重量と回数を入力してください");
      await save(database, "sets", revised(next));
      setError("");
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  };
  return (
    <div className={`set-row ${row.completedAt ? "done" : ""}`}>
      <div className="set-top">
        <b>SET {index + 1}</b>
        <select
          aria-label={`セット${index + 1}の種別`}
          value={row.setType}
          onChange={(e) =>
            run(() =>
              commit({ setType: e.target.value as WorkoutSet["setType"] }),
            )
          }
        >
          {Object.entries({
            warmup: "ウォームアップ",
            normal: "通常",
            drop: "ドロップ",
            failure: "失敗",
          }).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button
          className={row.completedAt ? "complete active" : "complete"}
          aria-label={`セット${index + 1}${row.completedAt ? "を未完了にする" : "を完了"}`}
          onClick={() =>
            run(async () => {
              if (
                await commit({
                  completedAt: row.completedAt
                    ? null
                    : new Date().toISOString(),
                })
              )
                if (!row.completedAt) {
                  completed();
                  setAskRir(true);
                }
            })
          }
        >
          <Check size={20} />
        </button>
      </div>
      <p className="hint">
        目標RIR：{formatRir(row.targetRir ?? null)} /
        実測は任意・未入力は空欄のまま
        {row.loadMode
          ? ` / 重量基準：${({ plateStack: "スタック表示", dumbbellEach: "ダンベル片手", total: "合計", eachSide: "片側", bodyweight: "自重", assisted: "補助重量", barbellTotal: "バー込み合計", unknown: "未確認" } as Record<string, string>)[row.loadMode] ?? row.loadMode}`
          : ""}
      </p>
      {askRir && (
        <div role="dialog" aria-label="実測RIRの確認" className="notice">
          <b>今のセットは、あと何回できましたか？</b>
          <p className="hint">0は限界。記録しなければ未入力のままです。</p>
          <div className="actions compact">
            {["0", "0.5", "1", "1〜2", "2", "3"].map((v) => (
              <button
                key={v}
                onClick={() => {
                  edit("rir", v);
                  setAskRir(false);
                }}
              >
                実測 {v}
              </button>
            ))}
            <button
              onClick={() => {
                edit("rir", "");
                setAskRir(false);
              }}
            >
              未入力で続ける
            </button>
            <button onClick={() => setAskRir(false)}>入力欄で編集</button>
          </div>
        </div>
      )}
      <div className="input-grid">
        <label>
          {unit}
          <input
            aria-label={`セット${index + 1}の重量`}
            inputMode="decimal"
            type="number"
            step="any"
            min="0"
            value={weight}
            onChange={(e) => edit("weight", e.target.value)}
            onBlur={() => void commit()}
          />
        </label>
        <label>
          回数
          <input
            aria-label={`セット${index + 1}の回数`}
            inputMode="numeric"
            type="number"
            min="0"
            step="1"
            value={reps}
            onChange={(e) => edit("reps", e.target.value)}
            onBlur={() => void commit()}
          />
        </label>
        <label>
          RIR
          <input
            aria-label={`セット${index + 1}のRIR`}
            inputMode="decimal"
            placeholder="未入力"
            value={rir}
            onChange={(e) => edit("rir", e.target.value)}
            onBlur={() => void commit()}
          />
        </label>
      </div>
      <div className="actions compact" aria-label="RIRの候補">
        {["", "0", "0.5", "1", "1〜2", "2", "3"].map((v) => (
          <button key={v} onClick={() => edit("rir", v)}>
            {v || "未入力"}
          </button>
        ))}
      </div>
      <div className="actions compact">
        <button
          disabled={!previous}
          onClick={() => {
            if (previous) {
              const next = {
                weight: String(round(kgToDisplay(previous.weightKg, unit))),
                reps: String(previous.reps),
                rir: "",
              };
              setDraft(next);
              localStorage.setItem(draftKey, JSON.stringify(next));
            }
            if (previous)
              run(() =>
                save(
                  database,
                  "sets",
                  revised({
                    ...row,
                    weightKg: previous.weightKg,
                    reps: previous.reps,
                    rir: null,
                    targetRir: row.targetRir ?? previous.rir,
                    inputUnit: previous.inputUnit,
                    inputWeight: previous.inputWeight,
                  }),
                ),
              );
          }}
        >
          前回をコピー
        </button>
        <button
          disabled={!canUp}
          aria-label="セットを上へ"
          onClick={() => run(() => move(-1))}
        >
          <ArrowUp size={15} />
        </button>
        <button
          disabled={!canDown}
          aria-label="セットを下へ"
          onClick={() => run(() => move(1))}
        >
          <ArrowDown size={15} />
        </button>
        <button
          aria-label={deleted ? "削除を確定" : `セット${index + 1}を削除`}
          onClick={() => {
            if (!deleted) {
              setDeleted(true);
              return;
            }
            run(() => remove(database, "sets", row));
          }}
        >
          {deleted ? "削除を確定" : <Trash2 size={16} />}
        </button>
        {deleted && <button onClick={() => setDeleted(false)}>取消</button>}
      </div>
      <label>
        セットメモ
        <input
          aria-label={`セット${index + 1}のメモ`}
          value={row.notes}
          onChange={(e) => void commit({ notes: e.target.value })}
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
function WellnessEditor({ sessionId = null }: { sessionId?: string | null }) {
  const { database, data } = useData();
  if (!data) return null;
  const existing = data.wellness.find((w) =>
    sessionId
      ? w.sessionId === sessionId
      : w.dateLocal === localDate() && w.sessionId === null,
  );
  const value: Entities["wellness"] = existing ?? {
    ...meta(),
    sessionId,
    dateLocal: localDate(),
    sleepHours: null,
    mood: null,
    fatigue: null,
    painFlag: false,
    sorenessByMuscle: {},
    bodyWeightKg: null,
    notes: "",
  };
  const update = (patch: Partial<Entities["wellness"]>) =>
    run(() =>
      save(
        database,
        "wellness",
        revised({
          ...value,
          ...patch,
          explicitInputFlags: {
            ...value.explicitInputFlags,
            ...Object.fromEntries(
              Object.entries(patch).map(([k, v]) => [
                k,
                v !== null && v !== "",
              ]),
            ),
          },
          sleepStatus: value.sleepStatus ?? "not-acquired",
        }),
      ),
    );
  return (
    <div className="wellness">
      <p className="hint">
        {existing
          ? `記録済み · 更新 ${new Date(existing.updatedAt).toLocaleString("ja-JP")}`
          : "任意 · まだ未入力。スキップできます。"}
      </p>
      <div className="input-grid">
        <div className="sleep-status">
          <small>睡眠</small>
          <p>
            {value.sleepHours === null
              ? "未取得"
              : `${value.sleepHours} h（既存記録）`}
          </p>
        </div>
        <label>
          気分
          <select
            value={value.mood ?? ""}
            onChange={(e) =>
              update({ mood: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">未入力</option>
            {[1, 2, 3, 4, 5].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          疲労
          <select
            value={value.fatigue ?? ""}
            onChange={(e) =>
              update({
                fatigue: e.target.value ? Number(e.target.value) : null,
              })
            }
          >
            <option value="">未入力</option>
            {[1, 2, 3, 4, 5].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">
        睡眠はショートカットの取得データを利用する予定です。現在は未連携。未取得分を推測・補完しません。
      </p>
      <div className="filter">
        {["胸", "背中", "肩", "腕"].map((m) => (
          <label key={m}>
            {m}の筋肉痛
            <select
              aria-label={`${m}の筋肉痛`}
              value={value.sorenessByMuscle[m] ?? ""}
              onChange={(e) => {
                const soreness = { ...value.sorenessByMuscle };
                if (e.target.value === "") delete soreness[m];
                else soreness[m] = Number(e.target.value);
                update({ sorenessByMuscle: soreness });
              }}
            >
              <option value="">未入力</option>
              {[0, 1, 2, 3, 4, 5].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={value.painFlag}
          onChange={(e) => update({ painFlag: e.target.checked })}
        />
        痛み・体調不良がある
      </label>
      <label>
        体重 ({data.profile?.units ?? "kg"})
        <input
          inputMode="decimal"
          type="number"
          min="1"
          step="any"
          value={
            value.bodyWeightKg === null
              ? ""
              : round(
                  kgToDisplay(value.bodyWeightKg, data.profile?.units ?? "kg"),
                )
          }
          onChange={(e) =>
            update({
              bodyWeightKg: e.target.value
                ? displayToKg(
                    Number(e.target.value),
                    data.profile?.units ?? "kg",
                  )
                : null,
            })
          }
        />
      </label>
      <label>
        体調メモ
        <input
          value={value.notes}
          onChange={(e) => update({ notes: e.target.value })}
        />
      </label>
    </div>
  );
}
function History() {
  const { database, data } = useData(),
    [filter, setFilter] = useState(""),
    [exercise, setExercise] = useState(""),
    [selected, setSelected] = useState<string | null>(null);
  if (!data) return null;
  const selectedSession = data.sessions.find((s) => s.id === selected);
  return (
    <>
      <Title eyebrow="YOUR JOURNEY" title="トレーニング履歴" />
      <div className="card filter">
        <label>
          日付
          <input
            type="date"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <label>
          種目
          <select
            value={exercise}
            onChange={(e) => setExercise(e.target.value)}
          >
            <option value="">すべて</option>
            {data.exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} / {e.equipmentId}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selectedSession ? (
        <>
          <button onClick={() => setSelected(null)}>← 一覧へ</button>
          <SessionEditor session={selectedSession} />
          <WellnessEditor sessionId={selectedSession.id} />
          <button
            className="danger"
            onClick={() => {
              if (confirm("このトレーニングを削除しますか？"))
                run(async () => {
                  await deleteSession(database, selectedSession.id);
                  setSelected(null);
                });
            }}
          >
            この記録を削除
          </button>
        </>
      ) : (
        data.sessions
          .filter(
            (s) =>
              (!filter || sessionDay(s) === filter) &&
              (!exercise || s.exercises.some((e) => e.exerciseId === exercise)),
          )
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
          .map((s) => (
            <button
              className="card history-link full"
              key={s.id}
              onClick={() => setSelected(s.id)}
            >
              <span>
                <small className="eyebrow">
                  {date(sessionDay(s) + "T12:00:00")}
                  {s.timePrecision === "date" ? " · 時刻不明" : ""}
                </small>
                <b>{s.name}</b>
                <small>
                  {s.exercises.length}種目 ·{" "}
                  {
                    data.sets.filter(
                      (x) => x.sessionId === s.id && x.completedAt,
                    ).length
                  }
                  セット完了
                </small>
              </span>
              <span className="tag">
                {s.status === "active" ? "途中" : "完了"} →
              </span>
            </button>
          ))
      )}
      {!data.sessions.length && (
        <section className="card muted">
          記録がありません。今日の画面から始めましょう。
        </section>
      )}
    </>
  );
}
function Analysis() {
  const { data } = useData(),
    [exercise, setExercise] = useState(""),
    [days, setDays] = useState(28),
    [metric, setMetric] = useState("e1rm");
  if (!data?.profile) return null;
  const unit = data.profile.units,
    selected = exercise || data.exercises[0]?.id,
    weekly = weeklySummary(data.sessions, data.sets);
  const points = data.sessions
    .filter(
      (s) =>
        s.status === "finished" &&
        (days === 0 ||
          Date.now() - Date.parse(sessionDay(s) + "T12:00:00") <=
            days * 86400000),
    )
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .flatMap((s) => {
      const sets = data.sets.filter(
        (x) =>
          x.sessionId === s.id &&
          x.exerciseId === selected &&
          x.completedAt &&
          x.setType !== "warmup",
      );
      if (!sets.length) return [];
      return [
        {
          name: date(sessionDay(s) + "T12:00:00"),
          weight: round(
            kgToDisplay(Math.max(...sets.map((x) => x.weightKg)), unit),
          ),
          reps: Math.max(...sets.map((x) => x.reps)),
          e1rm: sets.some((x) => epley(x) !== null)
            ? round(
                kgToDisplay(Math.max(...sets.map((x) => epley(x) ?? 0)), unit),
              )
            : null,
        },
      ];
    });
  const finished = data.sessions.filter((s) => s.status === "finished").length;
  return (
    <>
      <Title eyebrow="SMALL STEPS, REAL PROGRESS" title="進捗と分析" />
      <section className="card">
        <h2>目標への積み重ね</h2>
        <p>
          週間頻度 {weekly.sessions} / {data.profile.targetDaysPerWeek}回
        </p>
        <progress
          value={weekly.sessions}
          max={data.profile.targetDaysPerWeek}
        />
        <p>記録したセッション {finished}回</p>
        <p className="hint">
          体型の達成率は記録だけでは推定できません。頻度・筋群別セット数・種目の推移から進捗を確認しましょう。
        </p>
      </section>
      <section className="card">
        <h2>種目の推移</h2>
        <label>
          種目・器具
          <select
            value={selected ?? ""}
            onChange={(e) => setExercise(e.target.value)}
          >
            {data.exercises.map((e) => (
              <option key={e.id} value={e.id}>
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
          <label>
            指標
            <select value={metric} onChange={(e) => setMetric(e.target.value)}>
              <option value="e1rm">推定1RM ({unit})</option>
              <option value="weight">最高重量 ({unit})</option>
              <option value="reps">最多回数</option>
            </select>
          </label>
        </div>
        {points.length ? (
          <div className="chart" role="img" aria-label="種目の進捗グラフ">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={points}>
                <CartesianGrid stroke="#323843" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis width={40} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#20252e", color: "#eee" }}
                />
                <Line
                  dataKey={metric}
                  name={metric === "reps" ? "回数" : unit}
                  stroke="var(--accent)"
                  strokeWidth={3}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
            <p>
              直近：
              {points.at(-1)?.[metric as "weight" | "reps" | "e1rm"] ??
                "判断不可"}{" "}
              {metric === "reps" ? "回" : unit}
            </p>
          </div>
        ) : (
          <p className="muted">グラフを表示する記録がありません。</p>
        )}
        <p className="hint">
          推定1RMはEpley式の参考値（1〜12回のみ）。異なるマシン間の比較には使いません。
        </p>
      </section>
      <section className="card">
        <h2>今週の筋群別セット</h2>
        <p className="hint">
          完了した通常・ドロップ・失敗セットを集計（ウォームアップ除外）。RIR未入力を含むため、すべてがハードセットとは限りません。
        </p>
        {Object.entries(weekly.muscles).map(([name, v]) => (
          <div className="muscle" key={name}>
            <b>{name}</b>
            <span>
              {v.sets}セット · {v.frequency}回
            </span>
            <progress max={Math.max(20, v.sets)} value={v.sets} />
          </div>
        ))}
        {!Object.keys(weekly.muscles).length && <p>今週の記録はありません。</p>}
      </section>
      <section className="card">
        <h2>回復・個人予測</h2>
        <p className="muted">
          判断不可：睡眠・疲労と実績の関係や目標体型の到達率は、十分な記録と検証が必要です。個人予測モデルは未実装です。
        </p>
      </section>
    </>
  );
}
function Advice() {
  const { database } = useData();
  return <AdvicePanel key={database.name} database={database} />;
}
function download(content: string, name: string, type = "application/json") {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([content], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Settings({ storage }: { storage: string }) {
  const { database, data } = useData(),
    demo = useUI((s) => s.demo),
    [backup, setBackup] = useState<Backup | null>(null),
    [report, setReport] = useState(""),
    [exercise, setExercise] = useState<Entities["exercises"] | null>(null);
  if (!data?.profile) return null;
  const p = data.profile,
    update = (patch: Partial<Entities["profiles"]>) =>
      run(() => save(database, "profiles", revised({ ...p, ...patch })));
  return (
    <>
      <Title eyebrow="MAKE IT YOURS" title="設定" />
      <section className="card">
        <h2>トレーニング設定</h2>
        <div className="filter">
          <label>
            表示単位
            <select
              value={p.units}
              onChange={(e) => update({ units: e.target.value as "kg" | "lb" })}
            >
              <option>kg</option>
              <option>lb</option>
            </select>
          </label>
          <label>
            テーマ
            <select
              value={p.theme}
              onChange={(e) =>
                update({ theme: e.target.value as "dark" | "light" })
              }
            >
              <option value="dark">ダーク</option>
              <option value="light">ライト</option>
            </select>
          </label>
        </div>
        <label>
          目標
          <select
            value={p.goal}
            onChange={(e) => update({ goal: e.target.value })}
          >
            {["筋肥大", "筋力", "一般"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          週の目標回数
          <input
            type="number"
            min="1"
            max="7"
            inputMode="numeric"
            value={p.targetDaysPerWeek}
            onChange={(e) =>
              update({ targetDaysPerWeek: Number(e.target.value) })
            }
          />
        </label>
      </section>
      <section className="card">
        <h2>A/Bの初期メニュー</h2>
        <p className="hint">
          上半身・週4回を目安に、実施日は自由に選べます。既存メニュー・過去の記録は書き換えません。
        </p>
        <button onClick={() => run(() => installDefaultPlans(database))}>
          不足しているA/Bを追加
        </button>
      </section>
      <section className="card">
        <div className="section-heading">
          <h2>種目・マシン</h2>
          <button
            onClick={() =>
              setExercise({
                ...meta(),
                name: "",
                muscle: "胸",
                equipmentId: "",
                notes: "",
                measurementBasis: "total",
              })
            }
          >
            <Plus size={18} />
            追加
          </button>
        </div>
        {data.exercises.map((e) => (
          <button
            className="exercise-entry full"
            key={e.id}
            onClick={() => setExercise(e)}
          >
            <span>
              {e.name}
              <small>
                {e.muscle} / {e.equipmentId || "器具未指定"}
              </small>
            </span>
            <span>編集 →</span>
          </button>
        ))}
        {exercise && (
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              run(async () => {
                await save(database, "exercises", revised(exercise));
                setExercise(null);
              });
            }}
          >
            <label>
              種目名
              <input
                required
                value={exercise.name}
                onChange={(e) =>
                  setExercise({ ...exercise, name: e.target.value })
                }
              />
            </label>
            <label>
              筋群
              <input
                required
                value={exercise.muscle}
                onChange={(e) =>
                  setExercise({ ...exercise, muscle: e.target.value })
                }
              />
            </label>
            <label>
              マシン名 / Machine ID
              <input
                value={exercise.equipmentId}
                onChange={(e) =>
                  setExercise({ ...exercise, equipmentId: e.target.value })
                }
              />
            </label>
            <label>
              重量の基準
              <select
                value={exercise.measurementBasis}
                onChange={(e) =>
                  setExercise({
                    ...exercise,
                    measurementBasis: e.target
                      .value as Entities["exercises"]["measurementBasis"],
                  })
                }
              >
                <option value="total">総重量</option>
                <option value="eachSide">片側</option>
                <option value="plateStack">マシン目盛り</option>
                <option value="bodyweight">自重</option>
                <option value="dumbbellEach">ダンベル片手</option>
                <option value="barbellTotal">バー込み合計</option>
                <option value="assisted">補助重量</option>
                <option value="unknown">未確認</option>
              </select>
            </label>
            <label>
              永続フォームメモ（記録中に常時表示）
              <textarea
                value={exercise.evergreenNotes ?? exercise.notes}
                onChange={(e) =>
                  setExercise({ ...exercise, evergreenNotes: e.target.value })
                }
              />
            </label>
            <div className="actions">
              <button className="primary" type="submit">
                種目を保存
              </button>
              <button type="button" onClick={() => setExercise(null)}>
                取消
              </button>
            </div>
          </form>
        )}
      </section>
      <CsvImport key={database.name} database={database} />
      <section className="card">
        <h2>バックアップと復元</h2>
        <p className="hint">
          対象：{demo ? "デモ専用DB" : "実記録DB"}
          。削除情報も含め、全エンティティを書き出します。競合する既存IDは上書きせず保持します。
        </p>
        <button
          className="full"
          onClick={() =>
            run(async () =>
              download(
                JSON.stringify(await exportBackup(database), null, 2),
                `takin-2ku-${demo ? "demo-" : ""}${localDate()}.json`,
              ),
            )
          }
        >
          <Download size={18} />
          全データをJSON保存
        </button>
        <label>
          JSONを読み込む（プレビュー）
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                run(async () => {
                  try {
                    setBackup(parseBackup(await file.text()));
                    setReport("");
                  } catch (err) {
                    setReport(`読み込み失敗：${String(err)}`);
                    setBackup(null);
                  }
                });
              e.target.value = "";
            }}
          />
        </label>
        {backup && (
          <div className="notice">
            <p>
              検証済み：
              {Object.values(backup.data).reduce(
                (n, rows) => n + rows.length,
                0,
              )}
              件 / {date(backup.exportedAt)}
            </p>
            <p>
              現在のDBとIDが一致する記録は保持します。差分は競合として報告します。
            </p>
            <button
              className="primary"
              onClick={() =>
                run(async () => {
                  const r = await importBackup(database, backup);
                  setReport(
                    `追加 ${r.added}件 / 重複 ${r.duplicates}件 / 競合（既存を保持）${r.conflicts}件`,
                  );
                  setBackup(null);
                })
              }
            >
              このDBに復元
            </button>
            <button onClick={() => setBackup(null)}>取消</button>
          </div>
        )}
        <p role="status">{report}</p>
      </section>
      <section className="card">
        <h2>保存と同期</h2>
        <p>
          <span className="tag">ローカルモード</span> IndexedDB / schema v3
        </p>
        <p>保存領域：{storage}</p>
        <p>将来の同期キュー：{data.pending}件（送信なし）</p>
        <p className="hint">
          Firebase Auth・Firestore同期はPhase
          2で実装します。現在は接続も書き込みも行いません。
        </p>
        <button
          onClick={() =>
            run(async () => {
              const granted = await navigator.storage?.persist?.();
              setReport(
                granted
                  ? "永続保存が許可されました"
                  : "永続保存はブラウザー管理です。JSONバックアップを保存してください。",
              );
            })
          }
        >
          永続保存をリクエスト
        </button>
        <p className="hint">
          SafariのプライベートモードでもIndexedDBが利用可能なら読み書きします。ただし終了時の消去やブラウザーによる領域解放を防ぐことはできません。定期的にJSONを保存してください。保存に失敗した場合はエラーを表示します。
        </p>
      </section>
      <section className="card">
        <h2>iPhoneにインストール</h2>
        <p>
          Safariで開き、共有ボタン
          →「ホーム画面に追加」。最初にオンラインで開いた後、オフラインでも起動できます。
        </p>
        <h3>AI・プライバシー</h3>
        <p className="hint">
          健康・体調データを外部AIへ送信する機能は未実装です。記録はこのブラウザー内に保存します。有料サービスやApple
          Developer Programは不要です。
        </p>
        <h3>Apple Health</h3>
        <p className="hint">
          ショートカット経由の読み取りを将来対応予定です。現在は未連携・実機未検証。ワークアウトを含め、Apple
          Healthへの書き込み機能は実装しません。
        </p>
        <p className="eyebrow">takin' 2ku · 1.1.0 / ローカル版</p>
      </section>
    </>
  );
}
