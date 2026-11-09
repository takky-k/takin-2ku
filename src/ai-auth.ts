import { create } from "zustand";
import type { Auth, User } from "@firebase/auth";
import { validateAiReply } from "./ai-contract";
export const AI_ENDPOINT = "https://takin-2ku-ai.tk-tk-tk-20020115.workers.dev";
const consentKey = "takin-ai-consent-v1";
export function hasAiConsent() {
  try {
    return (
      JSON.parse(localStorage.getItem(consentKey) ?? "null")?.endpoint ===
      AI_ENDPOINT
    );
  } catch {
    return false;
  }
}
export const useAI = create<{
  ready: boolean;
  user: User | null;
  consent: boolean;
  busy: boolean;
  message: string;
  error: boolean;
}>(() => ({
  ready: false,
  user: null,
  consent: hasAiConsent(),
  busy: false,
  message: "端末内計算を使用しています",
  error: false,
}));
let auth: Auth | undefined, initializing: Promise<void> | undefined;
let authSdk: typeof import("@firebase/auth") | undefined;
export async function initAIAuth() {
  if (initializing) return initializing;
  initializing = (async () => {
    try {
      if (!navigator.onLine) throw Error("オフラインです");
      const response = await fetch(AI_ENDPOINT + "/config", {
        signal: AbortSignal.timeout(8000),
        credentials: "omit",
      });
      if (!response.ok) throw Error("AI受付の設定待ちです");
      const c = await response.json();
      if (
        c.projectId !== "takin--2ku" ||
        c.authDomain !== "takin--2ku.firebaseapp.com" ||
        typeof c.apiKey !== "string" ||
        !c.apiKey.startsWith("AIza")
      )
        throw Error("接続設定を確認できません");
      const [app, sdk] = await Promise.all([
        import("@firebase/app"),
        import("@firebase/auth"),
      ]);
      authSdk = sdk;
      auth = sdk.getAuth(
        app.getApps().find((a) => a.name === "takin-ai") ??
          app.initializeApp(
            {
              apiKey: c.apiKey,
              projectId: c.projectId,
              authDomain: c.authDomain,
            },
            "takin-ai",
          ),
      );
      try {
        await sdk.setPersistence(auth, sdk.browserLocalPersistence);
      } catch {
        /* The SDK can keep an in-memory session if storage is unavailable. */
      }
      sdk.onAuthStateChanged(auth, (user) =>
        useAI.setState({
          user,
          message: user
            ? "Googleログイン済み。送信への同意を確認してください"
            : "Googleログイン待ちです",
          error: false,
        }),
      );
      useAI.setState({ ready: true, error: false });
      try {
        localStorage.setItem("takin-ai-auth-enabled", "true");
      } catch {
        /* Session can still work. */
      }
    } catch (e) {
      useAI.setState({
        ready: false,
        message: e instanceof Error ? e.message : "AI接続を準備できません",
        error: true,
      });
      initializing = undefined;
    }
  })().finally(() => {
    if (!auth) initializing = undefined;
  });
  return initializing;
}
export async function loginAI() {
  if (!auth || !authSdk) throw Error("AI接続を準備してください");
  await authSdk.signInWithPopup(auth, new authSdk.GoogleAuthProvider());
}
export async function logoutAI() {
  setAiConsent(false);
  if (auth) await (await import("@firebase/auth")).signOut(auth);
}
export function setAiConsent(value: boolean) {
  try {
    if (value)
      localStorage.setItem(
        consentKey,
        JSON.stringify({ endpoint: AI_ENDPOINT, at: new Date().toISOString() }),
      );
    else localStorage.removeItem(consentKey);
    useAI.setState({
      consent: value,
      error: false,
      message: value
        ? "次のコンディション保存時から外部AIを使用します"
        : "送信を停止しました。端末内計算を使用します",
    });
  } catch {
    useAI.setState({
      consent: false,
      error: true,
      message: "同意を保存できないため外部送信は行いません",
    });
  }
}
export async function aiToken() {
  const user = useAI.getState().user;
  if (!user) throw Error("Googleログインが必要です");
  return user.getIdToken();
}
export async function testAIConnection() {
  const user = useAI.getState().user;
  if (!user) throw Error("Googleログインが必要です");
  useAI.setState({
    busy: true,
    message: "架空データでAI接続をテストしています…",
    error: false,
  });
  try {
    const input = {
      version: 1 as const,
      sessionId: "connection-test",
      condition: { sleepHours: null, mood: null, pain: false, fatigue: {} },
      exercises: [
        {
          exerciseId: "test-exercise",
          name: "接続テスト（架空データ）",
          muscle: "胸",
          elapsedDays: null,
          locked: true,
          targets: [
            {
              setId: "test-set",
              weightKg: 50,
              reps: 8,
              targetRir: { min: 2, max: 2 },
            },
          ],
          previous: [],
        },
      ],
    };
    const response = await fetch(AI_ENDPOINT + "/advice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + (await user.getIdToken()),
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15000),
      credentials: "omit",
    });
    if (!response.ok)
      throw Error(
        response.status === 503
          ? "本人UIDの許可設定が必要です。ログイン完了をこのチャットで知らせてください"
          : "接続を確認できませんでした。無料枠や回数制限を確認してください",
      );
    const raw = await response.json();
    if (raw.model !== "@cf/google/gemma-4-26b-a4b-it")
      throw Error("モデルを確認できません");
    validateAiReply(input, { recommendations: raw.recommendations });
    useAI.setState({
      message: "AI接続テスト成功（架空データ。実記録は送信していません）",
      error: false,
    });
  } catch (e) {
    useAI.setState({
      message: e instanceof Error ? e.message : "AI接続テストに失敗しました",
      error: true,
    });
  } finally {
    useAI.setState({ busy: false });
  }
}
