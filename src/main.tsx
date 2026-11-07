import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  NavLink,
  Route,
  Routes,
  Link,
  useNavigate,
  useParams,
  useLocation,
} from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Activity,
  ChartNoAxesCombined,
  House,
  Settings as SettingsIcon,
  Sparkles,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
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
  type Backup,
} from "./db";
import {
  type Entities,
  type WorkoutSet,
  formatRir,
  kgToDisplay,
  round,
  localDate,
} from "./model";
import { epley, weeklySummary } from "./analysis";
import { useUI } from "./store";
import "./style.css";
import { PlanEditor } from "./PlanEditor";
import { CsvImport } from "./CsvImport";
import { installDefaultPlans } from "./db";
import { sessionDay, comparison, finishWorkout } from "./training";
import { AdvicePanel } from "./AdvicePanel";
import { WellnessForm } from "./WellnessForm";
import { SetTable } from "./SetTable";
import { buildSessionMemo } from "./session-memo";
import { cleanAccidentalACopies, restoreMenuCopies } from "./menu-cleanup";
import { SleepImport } from "./health";
import { restorePendingSetInputs } from "./set-inputs";
import { useAppRefresh } from "./app-lifecycle";
import { ConditionRequired, prepareWorkout } from "./start-targets";
import { WorkoutImportPanel } from "./workout-import";
import { exportTrainingCsv } from "./training-export";
import { SleepConnectionSettings } from "./SleepConnection";

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
      health: alive(await database.health.toArray()),
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
  const route = useLocation();
  const { data, database } = useData(),
    { error, setError } = useUI(),
    [online, setOnline] = useState(navigator.onLine),
    [storage, setStorage] = useState("確認中");
  const [removedCopies, setRemovedCopies] = useState<Entities["plans"][]>([]);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const {
    needRefresh: [refresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      registration.current = reg ?? null;
      void reg?.update().catch(() => {});
    },
  });
  const checkUpdate = useCallback(async () => {
    await registration.current?.update();
  }, []);
  const appDate = useAppRefresh(database, checkUpdate);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    run(async () => {
      await seed(db);
      await restorePendingSetInputs(db);
      const removed = await cleanAccidentalACopies(db);
      if (removed.length) setRemovedCopies(removed);
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
  useEffect(() => {
    if (!route.hash) window.scrollTo(0, 0);
  }, [route.pathname, route.hash]);
  return (
    <>
      <header>
        <Link to="/" className="brand">
          <img
            className="brand-logo"
            src="./brand/t2-header.png"
            alt="T2"
            width="54"
            height="29"
          />
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
        {removedCopies.length > 0 && (
          <div className="notice" role="status">
            誤って複製したAメニューを削除しました。
            <button
              onClick={() =>
                run(async () => {
                  await restoreMenuCopies(database, removedCopies);
                  setRemovedCopies([]);
                })
              }
            >
              元に戻す
            </button>
          </div>
        )}

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
        {route.pathname !== "/" &&
          !route.pathname.startsWith("/workout") &&
          data?.sessions.some((s) => s.status === "active") && (
            <Link className="resume-strip" to="/workout/current">
              進行中のトレーニングに戻る →
            </Link>
          )}
        <Routes key={database.name}>
          <Route path="/" element={<Today key={appDate} />} />
          <Route path="/workout" element={<Workout />} />
          <Route path="/workout/current" element={<Workout />} />
          <Route path="/plans/new" element={<PlanEditRoute />} />
          <Route path="/plans/:planId/edit" element={<PlanEditRoute />} />
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
          [ChartNoAxesCombined, "/analysis", text.ja.analysis],
          [Sparkles, "/ai", text.ja.ai],
        ].map(([Icon, path, label]) => {
          const I = Icon as typeof House;
          return (
            <NavLink
              key={String(path)}
              end={path !== "/workout"}
              to={String(path)}
            >
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
  return (
    <>
      <h1 className="sr-only">今日のコンディション</h1>
      <p className="today-date">
        {new Date().toLocaleDateString("ja-JP", {
          month: "long",
          day: "numeric",
          weekday: "long",
        })}
      </p>
      <section className="card condition-card">
        <h2>今日のコンディション</h2>
        <WellnessEditor />
      </section>
    </>
  );
}
function MyMenus() {
  const { database, data } = useData();
  if (!data?.profile) return <p>メニューを準備中…</p>;

  return (
    <>
      {" "}
      <div className="section-heading" id="menus">
        <h2>マイメニュー</h2>
        <Link className="button" to="/plans/new">
          <Plus size={18} />
          作成
        </Link>
      </div>
      {data.plans.map((p) => (
        <section className="card menu-card" key={p.id}>
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
              disabled={!p.exercises.length}
              onClick={() =>
                run(async () => {
                  try {
                    await prepareWorkout(database, p, data.profile!.units);
                    useUI.getState().setError("");
                    window.location.hash = "/workout/current";
                  } catch (e) {
                    if (e instanceof ConditionRequired) {
                      useUI.getState().setError(e.message);
                      window.location.hash =
                        "/?plan=" + encodeURIComponent(p.id);
                      return;
                    }
                    throw e;
                  }
                })
              }
            >
              <Play size={17} />
              {data.sessions.some(
                (s) => s.planId === p.id && s.status !== "finished",
              )
                ? "続きから記録"
                : "開始する"}
            </button>
            <Link
              className="button"
              to={`/plans/${p.id}/edit`}
              aria-label={`${p.name}を編集`}
            >
              編集
            </Link>
          </div>
        </section>
      ))}
    </>
  );
}
function WeeklyTraining({ count, target }: { count: number; target: number }) {
  return (
    <section className="hero" aria-label="今週のトレーニング">
      <div className="hero-top">
        <span>今週のトレーニング</span>
        <Activity size={21} />
      </div>
      <div className="hero-number">
        {count}
        <small> / {target} 回</small>
      </div>
      <progress max={target} value={count} />
    </section>
  );
}
function PlanEditRoute() {
  const { planId } = useParams(),
    navigate = useNavigate(),
    { database, data } = useData();
  const [newPlan] = useState<Entities["plans"]>(() => ({
    ...meta(),
    name: "新しいメニュー",
    dayLabel: "",
    exercises: [],
  }));
  if (!data?.profile) return <p>メニューを読み込み中…</p>;
  const plan = planId ? data.plans.find((p) => p.id === planId) : newPlan;
  return (
    <>
      <Title eyebrow="MENU" title="メニュー編集" />
      {plan ? (
        <PlanEditor
          key={plan.id}
          plan={plan}
          database={database}
          exercises={data.exercises}
          unit={data.profile.units}
          close={() => navigate("/workout")}
        />
      ) : (
        <section className="card">
          <p>このメニューは見つかりません。</p>
          <Link className="button" to="/">
            今日へ戻る
          </Link>
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
  const picker = useLocation().pathname === "/workout";
  const s = data?.sessions.find((s) => s.status === "active");
  const latestFinished = data?.sessions
    .filter((s) => s.status === "finished")
    .sort(
      (a, b) =>
        sessionDay(b).localeCompare(sessionDay(a)) ||
        b.startedAt.localeCompare(a.startedAt),
    )[0];
  return (
    <>
      <Title eyebrow="TRAINING" title="トレーニング" />
      {picker ? (
        <MyMenus />
      ) : s?.requiresTargetReview ? (
        <section className="card">
          <p>
            開始の準備が完了していません。コンディションを保存してメニューを選び直してください。
          </p>
          <Link className="button" to="/workout">
            メニュー選択へ戻る
          </Link>
        </section>
      ) : s ? (
        <>
          <SessionEditor session={s} />
          <section className="card">
            <h2>今回のトレーニングを終了</h2>
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
                  セット入力済み。回数が未入力の予定セットは実績・分析に含みません。
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
        <MyMenus />
      )}
      {!picker && !s && latestFinished && (
        <details
          className="card post-workout-weight"
          open={sessionDay(latestFinished) === localDate()}
        >
          <summary>トレーニング後の体重を記録</summary>
          <h2>トレーニング後の体重</h2>
          <p className="hint">
            {sessionDay(latestFinished)} · {latestFinished.name}
          </p>
          <WellnessEditor sessionId={latestFinished.id} />
        </details>
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
      setType: "normal",
      weightKg: last?.weightKg ?? 0,
      reps: 0,
      inputState: {
        weight: String(round(kgToDisplay(last?.weightKg ?? 0, unit))),
        reps: "",
        rir: "",
        weightTouched: false,
        repsTouched: false,
      },
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
      <section className="card session-memo">
        <h3>今日のトレーニングメモ</h3>
        {buildSessionMemo(
          s,
          data.sessions,
          data.sets,
          data.wellness,
          data.health,
        ).map((note, i) => (
          <p key={i}>{note}</p>
        ))}
        <small className="hint">
          記録から作成するローカル分析 · 外部送信なし
        </small>
      </section>
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
            </aside>

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
            <SetTable
              database={database}
              rows={rows}
              previous={prev}
              unit={unit}
            />
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
        {[30, 60, 90, 120, 150].map((seconds) => (
          <button key={seconds} onClick={() => timer(seconds)}>
            {
              (
                {
                  30: "30秒",
                  60: "1分",
                  90: "1分30秒",
                  120: "2分",
                  150: "2分30秒",
                } as Record<number, string>
              )[seconds]
            }
          </button>
        ))}
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

function WellnessEditor({ sessionId = null }: { sessionId?: string | null }) {
  const { data, database } = useData();
  const requestedPlanId =
    new URLSearchParams(useLocation().search).get("plan") ?? undefined;
  if (!data?.profile) return null;
  const existing = data.wellness
    .filter((w) =>
      sessionId
        ? w.sessionId === sessionId
        : w.dateLocal === localDate() && w.sessionId === null,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return (
    <WellnessForm
      key={database.name + "-" + (sessionId ?? localDate())}
      database={database}
      existing={existing}
      sessionId={sessionId}
      unit={data.profile.units}
      health={data.health}
      date={
        existing?.dateLocal ??
        (sessionId
          ? data.sessions.find((s) => s.id === sessionId)
            ? sessionDay(data.sessions.find((s) => s.id === sessionId)!)
            : localDate()
          : localDate())
      }
      bodyOnly={sessionId !== null}
      plans={data.plans}
      exercises={data.exercises}
      requestedPlanId={requestedPlanId}
      onSaved={() => useUI.getState().setError("")}
    />
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
                {s.status === "finished" ? "完了" : "途中"} →
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
    latest = data.sessions
      .filter(
        (s) =>
          s.status === "finished" &&
          data.sets.some((r) => r.sessionId === s.id && r.completedAt),
      )
      .sort(
        (a, b) =>
          sessionDay(b).localeCompare(sessionDay(a)) ||
          b.startedAt.localeCompare(a.startedAt),
      )[0],
    selected =
      exercise ||
      latest?.exercises.find((e) =>
        data.sets.some(
          (r) =>
            r.sessionId === latest.id &&
            r.exerciseId === e.exerciseId &&
            r.completedAt,
        ),
      )?.exerciseId ||
      data.exercises[0]?.id,
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
  return (
    <>
      <Title eyebrow="SMALL STEPS, REAL PROGRESS" title="進捗と分析" />
      <WeeklyTraining
        count={weekly.sessions}
        target={data.profile.targetDaysPerWeek}
      />
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
      <Link className="button full" to="/history">
        保存したトレーニング記録を確認
      </Link>
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
      <section className="card">
        <SleepImport database={database} />
        <SleepConnectionSettings database={database} />
      </section>
      <CsvImport key={database.name} database={database} />
      <WorkoutImportPanel database={database} />
      <section className="card">
        <h2>バックアップと復元</h2>
        <button
          onClick={() =>
            run(async () =>
              download(
                await exportTrainingCsv(database),
                `takin-2ku-${localDate()}.csv`,
                "text/csv;charset=utf-8",
              ),
            )
          }
        >
          実績CSVを書き出す
        </button>
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
          ショートカットの睡眠JSONを読み取れます。自動同期とiPhone実機でのショートカット設定は未検証です。ワークアウトを含め、Apple
          Healthへの書き込みは行いません。
        </p>
        <p className="eyebrow">takin' 2ku · 1.5.0 / ローカル版</p>
      </section>
    </>
  );
}
