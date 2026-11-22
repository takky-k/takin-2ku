import { useEffect, useState } from "react";
import {
  initAIAuth,
  loginAI,
  logoutAI,
  setAiConsent,
  useAI,
  testAIConnection,
  installationReady,
  unlockInstallation,
} from "./ai-auth";
export function AIConnection() {
  const a = useAI(),
    [message, setMessage] = useState(""),
    [unlocking, setUnlocking] = useState(false);
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
          {!installationReady(a.user.uid) && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                setUnlocking(true);
                try {
                  await unlockInstallation(
                    String(new FormData(form).get("installation") ?? ""),
                  );
                  form.reset();
                  setMessage("");
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "AI連携を有効にできませんでした。",
                  );
                } finally {
                  setUnlocking(false);
                }
              }}
            >
              <label>
                AI連携用パスワード
                <input
                  type="password"
                  name="installation"
                  autoComplete="current-password"
                  required
                />
              </label>
              <button disabled={unlocking}>
                {unlocking ? "確認中…" : "この端末でAIを有効にする"}
              </button>
            </form>
          )}
          <button
            disabled={a.busy || !installationReady(a.user.uid)}
            onClick={() => void testAIConnection()}
          >
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
        トレーニング履歴（種目・重量・回数・RIR・実施間隔・過去のセットメモ）、年齢・身長・直近の体重・目標体重・トレーニング目標・週の目標回数・優先部位と、当日の睡眠時間・筋肉痛・気分・疲労・痛みの有無をCloudflare
        Workers AIへ送信することに同意する
      </label>
      <p className="hint">
        同意すると、コンディションの保存・トレーニング開始時にAIが未入力セットの目標を自動設定します。同意はいつでも解除できます。
      </p>
    </section>
  );
}
