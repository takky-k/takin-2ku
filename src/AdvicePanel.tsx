import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import type { AppDB } from "./db";
import {
  generateRecommendations,
  decideRecommendation,
} from "./recommendations";
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
          承認した候補は当該セッションの未完了セットだけに反映します。テンプレートや過去の実績は変更しません。
        </p>
        {active ? (
          <>
            <p>{active.name}</p>
            <button
              disabled={busy}
              className="primary full"
              onClick={() =>
                void perform(() => generateRecommendations(database, active.id))
              }
            >
              提案を作成
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
            {r.status === "draft" ? (
              <div className="actions">
                <button
                  disabled={busy}
                  className="primary"
                  onClick={() =>
                    void perform(() =>
                      decideRecommendation(database, r.id, true),
                    )
                  }
                >
                  承認して今回に反映
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(() =>
                      decideRecommendation(database, r.id, false),
                    )
                  }
                >
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
