import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import type { AppDB } from "./db";
import { refreshTargets } from "./start-targets";
import { kgToDisplay, round, formatRir } from "./model";
export function AdvicePanel({ database }: { database: AppDB }) {
  const data = useLiveQuery(
    async () => ({
      sessions: await database.sessions.toArray(),
      recommendations: await database.recommendations.toArray(),
      exercises: await database.exercises.toArray(),
      sets: await database.sets.toArray(),
      profile: await database.profiles.get("main"),
    }),
    [database],
  );
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  if (!data) return null;
  const active = data.sessions.find(
      (s) => !s.deletedAt && s.status === "active",
    ),
    unit = data.profile?.units ?? "lb";
  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      setMessage("");
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="title-row">
        <div>
          <p className="eyebrow">LOCAL COACH</p>
          <h1>次回の提案</h1>
        </div>
      </div>
      <section className="card">
        <span className="tag">ローカルルール · 外部送信なし</span>
        <h2>今日の予定を確認する</h2>
        <p className="muted">
          保存済みコンディションから安全な目標を再計算し、未入力のセットへ自動反映します。記録済みセットやマイメニューは変更しません。
        </p>
        {active ? (
          <>
            <p>{active.name}</p>
            <button
              disabled={busy}
              className="primary full"
              onClick={() =>
                void perform(() => refreshTargets(database, active.id))
              }
            >
              目標を再計算して自動反映
            </button>
            <Link className="button full" to="/workout/current">
              記録に戻る
            </Link>
          </>
        ) : (
          <Link className="button primary full" to="/workout">
            A/Bを選んで記録を開始
          </Link>
        )}
        <p className="hint">
          外部AIチャット・個人予測は未実装です。信頼度は未評価。無料APIの設定は不要です。
        </p>
      </section>
      <p role="alert">{message}</p>
      {data.recommendations
        .filter((r) => !r.deletedAt && r.sessionId === active?.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => (
          <section className="card" key={r.id}>
            <h3>{data.exercises.find((e) => e.id === r.exerciseId)?.name}</h3>
            {r.proposedTargets?.map((t, i) => {
              const old = data.sets.find((s) => s.id === t.setId);
              return (
                <p key={t.setId}>
                  SET {i + 1}：{round(kgToDisplay(t.weightKg, unit))}
                  {unit} × {t.reps}回 / 目標RIR {formatRir(t.targetRir)}
                  {old && (
                    <small className="delta">
                      {" "}
                      現在の予定から{" "}
                      {round(kgToDisplay(t.weightKg - old.weightKg, unit))}
                      {unit} / {t.reps - old.reps}回
                    </small>
                  )}
                </p>
              );
            })}
            <p>{r.rationale}</p>
            <p className="hint">
              local-rule v{r.modelVersion} · 根拠 {r.evidenceIds.length}セット ·
              信頼度未評価
            </p>
            <span className="tag">
              {r.status === "accepted"
                ? "自動反映済み"
                : r.status === "rejected"
                  ? "見送り"
                  : "未適用・再計算で自動反映"}
            </span>
          </section>
        ))}
    </>
  );
}
