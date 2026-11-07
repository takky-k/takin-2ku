import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { type AppDB, save, revised } from "./db";
import { type Entities, kgToDisplay, round, formatRir } from "./model";
import { startWorkout } from "./training";
import {
  generateRecommendations,
  decideRecommendation,
} from "./recommendations";
const preparing = new Map<string, Promise<string>>();
export function prepareWorkout(
  db: AppDB,
  plan: Entities["plans"],
  unit: "kg" | "lb",
) {
  const existing = preparing.get(db.name);
  if (existing) return existing;
  const task = (async () => {
    const id = await startWorkout(db, plan, unit),
      session = await db.sessions.get(id);
    if (!session) throw Error("セッションがありません");
    if (session.requiresTargetReview === false) return id;
    if (!session.requiresTargetReview)
      await save(
        db,
        "sessions",
        revised({ ...session, requiresTargetReview: true }),
      );
    await generateRecommendations(db, id);
    return id;
  })().finally(() => preparing.delete(db.name));
  preparing.set(db.name, task);
  return task;
}
export async function approveStart(db: AppDB, id: string, accept: boolean) {
  await db.transaction(
    "rw",
    [
      db.sessions,
      db.sets,
      db.recommendations,
      db.wellness,
      db.health,
      db.exercises,
      db.queue,
    ],
    async () => {
      const session = await db.sessions.get(id);
      if (!session || session.deletedAt || session.status !== "active")
        throw Error("セッションを確認してください");
      if (!session.requiresTargetReview) return;
      const recs = (await db.recommendations.toArray()).filter(
        (r) => !r.deletedAt && r.sessionId === id && r.status === "draft",
      );
      const latest = new Map<string, Entities["recommendations"]>();
      for (const r of recs.sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      ))
        latest.set(r.exerciseId, r);
      if (accept && latest.size !== session.exercises.length)
        throw Error("目標を作り直してから確認してください");
      for (const r of latest.values())
        await decideRecommendation(db, r.id, accept);
      await save(
        db,
        "sessions",
        revised({ ...session, requiresTargetReview: false }),
      );
    },
  );
}
export function StartReview({
  database,
  sessionId,
}: {
  database: AppDB;
  sessionId: string;
}) {
  const data = useLiveQuery(
    async () => ({
      profile: await database.profiles.get("main"),
      session: await database.sessions.get(sessionId),
      recommendations: await database.recommendations.toArray(),
    }),
    [database, sessionId],
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!data?.session) return <p>今日の目標を準備中…</p>;
  const unit = data.profile?.units ?? "lb",
    latest = new Map<string, Entities["recommendations"]>();
  for (const r of data.recommendations
    .filter(
      (r) => !r.deletedAt && r.sessionId === sessionId && r.status === "draft",
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
    latest.set(r.exerciseId, r);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card start-review">
      <h2>今日の目標を確認</h2>
      <p className="hint">
        同じ機器の前回実績と、保存済みの今日のコンディションから算出したローカル提案です。承認するまで今回の予定には適用しません。記録がない場合はマイメニューの予定値を使います。
      </p>
      {data.session.exercises.map((e) => {
        const r = latest.get(e.exerciseId);
        return (
          <div key={e.exerciseId} className="target-review">
            <h3>{e.name}</h3>
            {r?.proposedTargets?.map((t, i) => (
              <p key={t.setId}>
                SET {i + 1}：{round(kgToDisplay(t.weightKg, unit))}
                {unit} × {t.reps}回 · 目標RIR {formatRir(t.targetRir)}
              </p>
            ))}
            {r && (
              <details>
                <summary>判断理由</summary>
                <p>{r.rationale}</p>
              </details>
            )}
          </div>
        );
      })}
      <p className="hint">
        回数の欄は目標を薄く表示します。自分で入力した回数だけを実績として保存し、実測RIRは空欄から記録します。
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        className="primary full"
        disabled={busy || latest.size !== data.session.exercises.length}
        onClick={() => void run(() => approveStart(database, sessionId, true))}
      >
        この目標で開始
      </button>
      <button
        className="full"
        disabled={busy}
        onClick={() => void run(() => approveStart(database, sessionId, false))}
      >
        変更せず現在の予定で開始
      </button>
      <button
        className="full"
        disabled={busy}
        onClick={() =>
          void run(() => generateRecommendations(database, sessionId))
        }
      >
        コンディションを再確認して目標を更新
      </button>
    </section>
  );
}
