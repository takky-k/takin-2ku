import { useState } from "react";
import type { AppDB } from "./db";
import {
  readSleepConnection,
  saveSleepConnection,
  refreshSleep,
  useSleepState,
} from "./sleep-sync";
import { mappingSchema } from "./health";
export function SleepConnectionSettings({ database }: { database: AppDB }) {
  const initial = readSleepConnection();
  const [url, setUrl] = useState(initial?.url ?? ""),
    [token, setToken] = useState(initial?.token ?? ""),
    [mapping, setMapping] = useState(
      initial?.mapping ? JSON.stringify(initial.mapping, null, 2) : "",
    ),
    [message, setMessage] = useState("");
  const updating = useSleepState((s) => s.updating);
  return (
    <details className="sleep-connection">
      <summary>睡眠の自動取得先を設定</summary>
      <p className="hint">
        取得先が設定済みの場合だけ、起動・復帰時に自動確認します。GitHub
        Pagesに受信APIはありません。本人用の認証・CORS対応HTTPS
        APIが別途必要です。アカウント作成・課金・秘密情報の公開は自動で行いません。
      </p>
      <label>
        睡眠JSONを取得するHTTPS API
        <input
          type="url"
          value={url}
          autoComplete="off"
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <label>
        本人用アクセストークン
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      <label>
        実JSONのフィールド対応（必要な場合）
        <textarea
          value={mapping}
          onChange={(e) => setMapping(e.target.value)}
          placeholder={
            '{"list":"samples","start":"startAt","end":"endAt","stage":"stage","source":"source","date":"dateLocal","stageValues":{"asleep":"asleep"}}'
          }
        />
      </label>
      <p className="hint">
        JSONの形が異なる場合は対応表を指定してください。未確認の形や睡眠段階を推測して登録しません。トークンとURLはこのブラウザーだけに保存し、JSONバックアップやGitHubには含めません。
      </p>
      <button
        disabled={updating}
        onClick={() => {
          try {
            const parsed = mapping.trim()
              ? mappingSchema.parse(JSON.parse(mapping))
              : undefined;
            saveSleepConnection({ url, token, mapping: parsed });
            setMessage("設定を保存しました");
            void refreshSleep(database);
          } catch (e) {
            setMessage(String(e));
          }
        }}
      >
        取得先を保存
      </button>
      <button
        onClick={() => {
          saveSleepConnection(null);
          setUrl("");
          setToken("");
          setMessage("自動取得先を解除しました");
          void refreshSleep(database);
        }}
      >
        取得先を解除
      </button>
      <p role="status">{message}</p>
    </details>
  );
}
