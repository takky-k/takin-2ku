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
      plans: alive(await database.plans.toArray()),
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
  const { data } = useData(),
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
          {online ? "ローカル保存" : "オフライン"} · {data?.pending ?? 0}件
        </div>
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
        <Routes>
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
          [CalendarDays, "/history", text.ja.history],
          [ChartNoAxesCombined, "/analysis", text.ja.analysis],
          [Sparkles, "/ai", text.ja.ai],
          [SettingsIcon, "/settings", text.ja.settings],
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
    const s: Entities["sessions"] = {
      ...meta(),
      name: p.name,
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: "active",
      planId: p.id,
      notes: "",
      exercises: p.exercises.map((t) => {
        const e = data!.exercises.find((e) => e.id === t.exerciseId)!;
        return {
          exerciseId: e.id,
          name: e.name,
          muscle: e.muscle,
          equipmentId: e.equipmentId,
          notes: e.notes,
        };
      }),
    };
    await database.transaction(
      "rw",
      [database.sessions, database.sets, database.queue],
      async () => {
        await save(database, "sessions", s);
        for (const t of p.exercises) {
          const previous = previousSets(
            data!.sessions,
            data!.sets,
            t.exerciseId,
          );
          for (let i = 0; i < t.targetSets; i++) {
            const prev = previous[i];
            await save(database, "sets", {
              ...meta(),
              sessionId: s.id,
              exerciseId: t.exerciseId,
              equipmentId: s.exercises.find(
                (e) => e.exerciseId === t.exerciseId,
              )!.equipmentId,
              ordinal: i,
              setType: prev?.setType ?? "normal",
              weightKg: prev?.weightKg ?? t.plannedWeightKg,
              reps: prev?.reps ?? t.repMin,
              rir: prev?.rir ?? (prev ? null : t.targetRir),
              rpe: null,
              completedAt: null,
              notes: "",
              restSeconds: 90,
            });
          }
        }
      },
    );
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
          睡眠・疲労・痛みを記録して、無理のないトレーニングへ。
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
      {editing && <PlanEditor plan={editing} close={() => setEditing(null)} />}
      <h2>直近のトレーニング</h2>
      {latest ? (
        <Link to="/history" className="card history-link">
          <span>
            <b>{latest.name}</b>
            <small>{date(latest.startedAt)}</small>
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
function PlanEditor({
  plan,
  close,
}: {
  plan: Entities["plans"];
  close: () => void;
}) {
  const { database, data } = useData(),
    [draft, setDraft] = useState(plan),
    [message, setMessage] = useState("");
  if (!data) return null;
  return (
    <section className="card editor" aria-label="メニュー編集">
      <h2>メニュー編集</h2>
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
          placeholder="月・木 / 胸と背中"
          onChange={(e) => setDraft({ ...draft, dayLabel: e.target.value })}
        />
      </label>
      {draft.exercises.map((t, i) => (
        <div className="plan-exercise" key={t.exerciseId}>
          <b>{data.exercises.find((e) => e.id === t.exerciseId)?.name}</b>
          <div className="input-grid">
            <label>
              セット
              <input
                type="number"
                min="1"
                max="20"
                value={t.targetSets}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    exercises: draft.exercises.map((x, n) =>
                      n === i
                        ? { ...x, targetSets: Number(e.target.value) }
                        : x,
                    ),
                  })
                }
              />
            </label>
            <label>
              目標回数
              <input
                type="number"
                min="0"
                value={t.repMin}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    exercises: draft.exercises.map((x, n) =>
                      n === i
                        ? {
                            ...x,
                            repMin: Number(e.target.value),
                            repMax: Math.max(Number(e.target.value), x.repMax),
                          }
                        : x,
                    ),
                  })
                }
              />
            </label>
            <label>
              初期重量 kg
              <input
                type="number"
                min="0"
                step="any"
                value={t.plannedWeightKg}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    exercises: draft.exercises.map((x, n) =>
                      n === i
                        ? { ...x, plannedWeightKg: Number(e.target.value) }
                        : x,
                    ),
                  })
                }
              />
            </label>
          </div>
          <div className="actions">
            <button
              disabled={i === 0}
              aria-label="種目を上へ"
              onClick={() => {
                const items = [...draft.exercises];
                [items[i - 1], items[i]] = [items[i], items[i - 1]];
                setDraft({ ...draft, exercises: items });
              }}
            >
              <ArrowUp size={16} />
            </button>
            <button
              onClick={() =>
                setDraft({
                  ...draft,
                  exercises: draft.exercises.filter((_, n) => n !== i),
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
            if (e.target.value)
              setDraft({
                ...draft,
                exercises: [
                  ...draft.exercises,
                  {
                    exerciseId: e.target.value,
                    targetSets: 3,
                    repMin: 8,
                    repMax: 12,
                    targetRir: { min: 1, max: 2 },
                    plannedWeightKg: 20,
                  },
                ],
              });
          }}
        >
          <option value="">選択してください</option>
          {data.exercises
            .filter((e) => !draft.exercises.some((x) => x.exerciseId === e.id))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} / {e.equipmentId}
              </option>
            ))}
        </select>
      </label>
      <p role="alert">{message}</p>
      <div className="actions">
        <button
          className="primary"
          onClick={() => {
            if (!draft.name.trim() || !draft.exercises.length) {
              setMessage("名前と1種目以上を入力してください");
              return;
            }
            run(async () => {
              await save(database, "plans", revised(draft));
              close();
            });
          }}
        >
          メニューを保存
        </button>
        <button onClick={close}>閉じる</button>
        <button
          onClick={() => {
            if (
              confirm("このメニューを削除しますか？ 過去の記録は保持します。")
            )
              run(async () => {
                await remove(database, "plans", draft);
                close();
              });
          }}
        >
          削除
        </button>
      </div>
    </section>
  );
}
function previousSets(
  sessions: Entities["sessions"][],
  sets: WorkoutSet[],
  exerciseId: string,
  exclude?: string,
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
            x.completedAt &&
            !x.deletedAt,
        )
        .sort((a, b) => a.ordinal - b.ordinal)
    : [];
}
function Workout() {
  const { data, database } = useData();
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
            <button
              className="primary full"
              onClick={() =>
                run(() =>
                  save(
                    database,
                    "sessions",
                    revised({
                      ...s,
                      status: "finished",
                      endedAt: new Date().toISOString(),
                    }),
                  ),
                )
              }
            >
              トレーニングを終了
            </button>
          </section>
        </>
      ) : (
        <section className="card">
          <p>トレーニングが終了したか、まだ開始されていません。</p>
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
      rir: last?.rir ?? null,
      rpe: null,
      completedAt: null,
      notes: "",
      restSeconds: 90,
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
          prev = previousSets(data.sessions, data.sets, e.exerciseId, s.id);
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
            <label>
              種目メモ
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
                completed={() => timer(row.restSeconds ?? 90)}
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
                          notes: x.notes,
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
        <button onClick={() => timer(60)}>60秒</button>
        <button onClick={() => timer(90)}>90秒</button>
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
    [deleted, setDeleted] = useState(false);
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
      const next = {
        ...row,
        weightKg:
          fields.weight === String(round(kgToDisplay(row.weightKg, unit)))
            ? row.weightKg
            : displayToKg(Number(fields.weight), unit),
        reps: Number(fields.reps),
        rir: parseRir(fields.rir),
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
                if (!row.completedAt) completed();
            })
          }
        >
          <Check size={20} />
        </button>
      </div>
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
                rir: previous.rir === null ? "" : formatRir(previous.rir),
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
                    rir: previous.rir,
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
    run(() => save(database, "wellness", revised({ ...value, ...patch })));
  return (
    <div className="wellness">
      <div className="input-grid">
        <label>
          睡眠 (h)
          <input
            aria-label="睡眠時間"
            type="number"
            inputMode="decimal"
            min="0"
            max="24"
            step="0.5"
            value={value.sleepHours ?? ""}
            onChange={(e) =>
              update({
                sleepHours:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>
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
              (!filter || localDate(new Date(s.startedAt)) === filter) &&
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
                <small className="eyebrow">{date(s.startedAt)}</small>
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
        (days === 0 || Date.now() - Date.parse(s.startedAt) <= days * 86400000),
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
          name: date(s.startedAt),
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
                  stroke="#9bcb70"
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
  const { data, database } = useData();
  if (!data) return null;
  async function generate() {
    for (const p of data!.plans)
      for (const t of p.exercises) {
        const previous = previousSets(data!.sessions, data!.sets, t.exerciseId),
          well = data!.wellness.find((w) => w.dateLocal === localDate()),
          base = t.plannedWeightKg;
        const result = suggest(
          base,
          previous,
          well?.painFlag ?? false,
          well?.fatigue ?? null,
        );
        await save(database, "recommendations", {
          ...meta(),
          exerciseId: t.exerciseId,
          planId: p.id,
          sourceModel: "local-rule",
          modelVersion: "1.0",
          originalWeightKg: t.plannedWeightKg,
          proposedWeightKg: result.weight,
          rationale: result.rationale,
          evidenceIds: previous.map((s) => s.id),
          predictedPerformance: null,
          actualPerformance: null,
          confidence: null,
          status: "draft",
          decisionAt: null,
        });
      }
  }
  async function decide(r: Entities["recommendations"], accept: boolean) {
    await database.transaction(
      "rw",
      [
        database.plans,
        database.recommendations,
        database.wellness,
        database.queue,
      ],
      async () => {
        if (accept) {
          const p = await database.plans.get(r.planId);
          if (
            !p ||
            p.deletedAt ||
            p.exercises.find((e) => e.exerciseId === r.exerciseId)
              ?.plannedWeightKg !== r.originalWeightKg
          )
            throw Error("メニューが変更されています。提案を作り直してください");
          const wellness = (await database.wellness.toArray()).filter(
            (w) => !w.deletedAt && w.dateLocal === localDate(),
          );
          if (
            r.proposedWeightKg > r.originalWeightKg &&
            wellness.some((w) => w.painFlag || (w.fatigue ?? 0) >= 4)
          )
            throw Error(
              "痛み・強い疲労が記録されています。増量せず提案を作り直してください",
            );
          if (
            r.proposedWeightKg >
            Math.min(r.originalWeightKg * 1.025, r.originalWeightKg + 2.5)
          )
            throw Error("増量上限を超えるため適用できません");
          await save(
            database,
            "plans",
            revised({
              ...p,
              exercises: p.exercises.map((e) =>
                e.exerciseId === r.exerciseId
                  ? { ...e, plannedWeightKg: r.proposedWeightKg }
                  : e,
              ),
            }),
          );
        }
        await save(
          database,
          "recommendations",
          revised({
            ...r,
            status: accept ? "accepted" : "rejected",
            decisionAt: new Date().toISOString(),
          }),
        );
      },
    );
  }
  return (
    <>
      <Title eyebrow="YOUR NEXT STEP" title="次回の提案" />
      <section className="card">
        <span className="tag">オフライン対応 · ローカルルール</span>
        <h2>記録から、次の目標を。</h2>
        <p className="muted">
          外部AIとの通信はありません。一般ルールによる候補を作成し、承認した場合だけメニューに反映します。
        </p>
        <button className="primary" onClick={() => run(generate)}>
          <Sparkles size={18} />
          提案を作成
        </button>
      </section>
      {data.recommendations
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => (
          <section className="card" key={r.id}>
            <h3>{data.exercises.find((e) => e.id === r.exerciseId)?.name}</h3>
            <p className="hero-number small-number">
              {round(
                kgToDisplay(r.proposedWeightKg, data.profile?.units ?? "kg"),
              )}
              <small>{data.profile?.units ?? "kg"}</small>
            </p>
            <p>{r.rationale}</p>
            <p className="hint">
              local-rule v{r.modelVersion} · 元データ {r.evidenceIds.length}
              セット · 信頼度：未評価
            </p>
            {r.status === "draft" ? (
              <div className="actions">
                <button
                  className="primary"
                  onClick={() => run(() => decide(r, true))}
                >
                  承認して反映
                </button>
                <button onClick={() => run(() => decide(r, false))}>
                  却下
                </button>
              </div>
            ) : (
              <span className="tag">
                {r.status === "accepted" ? "承認済み" : "却下済み"}
              </span>
            )}
          </section>
        ))}
    </>
  );
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
              </select>
            </label>
            <label>
              メモ
              <input
                value={exercise.notes}
                onChange={(e) =>
                  setExercise({ ...exercise, notes: e.target.value })
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
        <button
          className="full"
          onClick={() => {
            const csv = [
              "sessionId,exerciseId,weightKg,reps,rirMin,rirMax,setType,completedAt",
              ...data.sets.map((s) =>
                [
                  s.sessionId,
                  s.exerciseId,
                  s.weightKg,
                  s.reps,
                  s.rir?.min ?? "",
                  s.rir?.max ?? "",
                  s.setType,
                  s.completedAt ?? "",
                ].join(","),
              ),
            ].join("\r\n");
            download(
              "\ufeff" + csv,
              `takin-2ku-sets-${localDate()}.csv`,
              "text/csv;charset=utf-8",
            );
          }}
        >
          セット記録をCSV保存
        </button>
      </section>
      <section className="card">
        <h2>保存と同期</h2>
        <p>
          <span className="tag">ローカルモード</span> IndexedDB / schema v2
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
          ショートカット経由の入出力はPhase
          3で実装予定です。現時点でHealthの自動同期はありません。
        </p>
        <p className="eyebrow">takin' 2ku · 1.0.0 / Phase 1</p>
      </section>
    </>
  );
}
