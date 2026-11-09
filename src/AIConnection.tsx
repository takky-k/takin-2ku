import { useEffect, useState } from "react";
import {
  initAIAuth,
  loginAI,
  logoutAI,
  setAiConsent,
  useAI,
  testAIConnection,
} from "./ai-auth";
export function AIConnection() {
  const a = useAI(),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (a.consent) void initAIAuth();
  }, []);
  async function act(action: () => Promise<unknown>) {
    try {
      await action();
      setMessage("");
    } catch {
      setMessage(
        "ログインを完了できませんでした。ポップアップを許可して再試行してください。",
      );
    }
  }
  return (
    <section className="card ai-connection">
      <h2>外部AI接続</h2>
      <p className="hint">
        Cloudflare Workers AI ·
        無料枠。記録は端末に保存し、Firestoreへ同期しません。
      </p>
      <p role="status">{a.message}</p>
      {message && <p role="alert">{message}</p>}
      {a.user ? (
        <>
          <p className="hint">
            Googleログイン済み · UID: <code>{a.user.uid}</code>
          </p>
          <button onClick={() => void act(logoutAI)}>ログアウト</button>
          <button disabled={a.busy} onClick={() => void testAIConnection()}>
            AI接続をテスト
          </button>
        </>
      ) : (
        <button disabled={!a.ready} onClick={() => void act(loginAI)}>
          Googleでログイン
        </button>
      )}
      {!a.ready && (
        <button onClick={() => void initAIAuth()}>AI接続を準備</button>
      )}
      <label className="ai-consent">
        <input
          type="checkbox"
          checked={a.consent}
          onChange={(e) => setAiConsent(e.target.checked)}
        />
        種目名・重量・回数・RIR・実施間隔と、睡眠時間・気分・部位の疲労・痛みの有無をCloudflare
        Workers AIへ送信することに同意する
      </label>
      <p className="hint">
        体重・氏名・メール・自由記述メモは送信しません。同意はこのブラウザーで保持します。解除すると以後の送信を停止します。AIの回答は安全条件を満たす未入力セットへ反映し、応答失敗時は端末内計算を使います。
      </p>
    </section>
  );
}
