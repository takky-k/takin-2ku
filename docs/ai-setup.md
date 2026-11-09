# takin' 2ku AI接続の運用

## 無料プランと設定

GitHub Pagesはそのまま。Cloudflare Workers Free + Workers AIの無料枠を使い、モデルは `@cf/google/gemma-4-26b-a4b-it`。有料モデル・Workers Paid・Firebase Blaze・課金登録は使わない。無料枠超過時は端末内計算へ戻す。

`npm run build:worker` で `.npm-cache/worker.js` を生成。Cloudflare Dashboardのtakin-2ku-aiのEdit codeへ貼付/Deployする。Wranglerを使う場合は `worker/wrangler.jsonc` とDashboardの設定を同期し、公開前に差分を確認する。CIはWorkerをビルド/テストするが、Workerへ自動公開しない。

必要なBindings:

- Workers AI: `AI`
- Rate limiter: `AI_RATE_LIMITER`, namespace `190001`, limit 5, period 60秒。これはCloudflareの分散レート制限であり、厳密な全拠点合算日次上限ではない。無料モデル側の日次割当も適用される。

Runtime Variables:

- `FIREBASE_PROJECT_ID`: 既存プロジェクトID
- `FIREBASE_API_KEY`: 既存Webアプリの公開設定キー（AIサービスの秘密キーではない）。値はリポジトリに記載せずDashboardで設定。
- `ALLOWED_ORIGIN`: `https://takky-k.github.io`
- `ALLOWED_UID`: 初回Googleログイン後に本人のFirebase UIDをDashboardで設定。空欄時は全AIリクエスト拒否。

Firebase AuthenticationのGoogleを有効化し、Authorized domainsにtakky-k.github.ioを設定。Firestore rulesは全拒否を維持。サービスアカウント鍵・OAuth秘密鍵の作成は不要。

## 初回利用

1. アプリのAIタブで「AI接続を準備」。公開Firebase設定だけをWorkerから取得する。
2. 「Googleでログイン」。本人がGoogleのアカウント選択/認証を操作する。
3. 管理者がログインした本人のUIDだけをALLOWED_UIDへ登録。
4. 「AI接続をテスト」で架空データによる応答を確認。健康データ送信同意はこのテストには不要。
5. ユーザーが明示的に送信同意を選ぶ。コンディション保存→端末内目標計算→AI照会→端末内安全確認→未入力目標へ反映。

同意はブラウザー単位。demo DBは送信しない。同意解除/ログアウト後は送信しない。オフラインではAIに接続せずローカル継続。

## 保護

RS256署名/iss/aud/exp/iat/auth_time、Google provider、email_verified、許可UIDを検証。CORSだけを認証と見なさない。32KBの入力上限、厳密なZod schema、レート制限、出力ID/数値/固定セット検証。プロンプトへ自由記述メモを渡さず、任意URLへのプロキシ化は不可。入力/出力/ID tokenをconsoleやDBへサーバー保存しない。AI Gatewayのログ/キャッシュは使わない。Firebase SDKのID tokenは失効チェックを行わない通常検証で、短命tokenの有効期限まではサーバーで有効になり得る。CloudflareのUID削除で受付停止できる。

AIの推論や最適化の有効性を保証せず、confidence/予測性能はnullのまま保存。AI提案は端末内目標を上回れない。新規セットの追加・削減は行わない。受信中にセッション/セット/コンディション/種目設定が変化した場合、全体を適用せずローカル実績を保持する。

## 確認

- GET `/health`: 設定と本人UID/limiterの有無。秘密情報なし。
- GET `/config`: Firebaseの公開Web設定のみ。AI利用の認可ではない。
- POST `/advice`: GoogleのFirebase ID tokenと許可UIDが必須。
- `npm test`, `npm run build`, `npm run build:worker`, `npm run test:e2e`。

本人の実ログイン・許可UID設定・実モデルとの応答は、モックテストの成功と区別して記録する。iPhone Safari/ChromeのGoogleログインは実機で確認する。
