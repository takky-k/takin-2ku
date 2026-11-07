# takin' 2ku

iPhoneの縦画面を中心に使う、日本語の筋トレ管理PWA。**Phase 1：ローカル単独版**です。React / TypeScript strict / Vite / Tailwind CSS / Dexie / Recharts / Zustand / Zodを使用します。必須の有料サービス、Apple Developer Program、LLM API、Firebase設定はありません。

## 起動・検証（Windows対応）

Node.js 22.12以上とGitを使用します。

```powershell
npm ci
npm run dev
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

開発URLは `http://127.0.0.1:5173/takin-2ku/`、ビルドの確認は `npm run preview` です。Service Workerは本番ビルドで有効になるため、オフライン確認にはpreviewを使います。依存バージョンはpackage-lock.jsonで固定します。

## Phase 1の機能

- 今日 / 履歴 / 分析 / AI / 設定の下部ナビ、日本語・ダーク/ライト表示。
- 曜日・部位のメニュー作成・編集・複製・削除、セット数と目標回数・初期重量の編集。
- 種目・マシン・重量基準・メモの管理。同名でも種目IDで区別。
- セッション内の種目追加・削除・並べ替え。過去の名称・マシン・メモをスナップショットで保持。
- セットの重量・回数・RIR・種別（ウォームアップ/通常/ドロップ/失敗）、完了・取消・追加・編集・削除・並べ替え。削除は2段階確認、取り消しも可能。
- RIRの空欄はnull、0は `{min:0,max:0}`。0〜10の0.5刻みと `1~2` / `1〜2` の範囲。専用候補ボタン付き。
- 前回の完了セットを表示・コピー、メニュー開始時の初期値にも利用。
- 入力の都度IndexedDB保存。入力途中の文字列はデモ/実データ別のlocalStorageへ補助保存。休憩タイマーは終了時刻から復元。
- 睡眠・気分・疲労・痛み・体重・体調メモ。トレーニング終了前にも体重を入力可能。
- 履歴の日付/種目フィルタ、詳細、編集、ソフトデリート。
- 重量/回数/推定1RMの期間別グラフ、週間の筋群別セット数と頻度、週間目標バー。推定1RMは1〜12回のみ。体型の達成率や個人予測精度は未推定と表示。
- 外部AI不要の決定論的な提案。増量上限は2.5%かつ2.5kg。痛み・強い疲労で増量しない。明示承認前にメニューを更新しない。
- kg/lb表示切替、内部保存はkg。デモDBを完全に分離。
- JSON全エンティティのエクスポート、検証・プレビュー付きインポート、ID重複検出、競合は既存を保持して件数を報告。セットCSV出力。
- インストール可能なPWA、オフラインシェル、確認式の更新。トレーニング中は更新を抑止。

## 保存と将来の同期

`src/model.ts` がデータ契約、`src/db.ts` が原子的な保存・バックアップ・移行、`src/analysis.ts` が純粋な分析と提案関数です。

全ドメインレコードに `id / schemaVersion / createdAt / updatedAt / deletedAt / clientId / revision` を付与。日時はISO8601 UTC、表示は端末ローカル時刻。セッションに種目情報を複製し、テンプレート変更で過去記録を書き換えません。ローカル変更とSyncOperationは同じDexieトランザクションで確定し、削除はtombstoneを保持します。

DB名は `takin-2ku` と `takin-2ku-demo`。DB/schema v2はv1の数値RIRをmin/max形式に移行します。JSON v1も同様に移行し、未知のバージョン・不正な値・ファイル内の重複ID・セットの参照不整合を拒否します。復元はトランザクション全体でロールバックし、既存IDの異なる内容を自動上書きしません。同期キューはバックアップのドメインレコードから再構築します。

Phase 2用のSyncAdapterとAI provider interfaceを分離しました。Health・予測/実績・説明根拠・体調データの保存先も予約しています。**Firebase SDKを接続せず、Auth・Firestoreへの通信/書き込みは一切行いません。** `firestore.rules` は全拒否のままです。このファイルを自動デプロイする処理もありません。Spark維持、Blaze・カード登録要求なし。

今後の同期は認証後に `users/{uid}/{collection}/{id}` を使用し、競合解決・バックオフ・UID分離・ルールのEmulatorテストを実装します。現在のキュー件数は「将来同期する変更数」で、クラウドへの同期成功を意味しません。

## Safariの保存について

IndexedDBが利用できるSafariでは、通常/プライベートのどちらでも同じコードで保存・読み込みます。ただし**プライベートセッション終了時の消去、OS/ブラウザーによる保存領域解放はPWAから防げません**。永続保存APIの可否を案内し、DB書き込み失敗は明示します。定期的なJSONバックアップが必要です。保存できない環境を「保存済み」として扱いません。

ホーム画面への追加：Safariで公開URLを開く → 共有 → ホーム画面に追加。初回はオンラインでService Workerのキャッシュ完了を待ちます。

## GitHub Pages

対象リポジトリは **takky-k/takin-2ku**。仕様の古い例にある `liftlog-ai` は使用しません。

1. GitHubのリポジトリ Settings → Pages → Build and deployment → Source を **GitHub Actions** に設定。
2. この変更をmainへマージ（またはmainへpush）。`.github/workflows/deploy.yml` が `npm ci → build → test → Playwright → Pages deploy` を実行。
3. Actionsの緑の完了を確認後、`https://takky-k.github.io/takin-2ku/` を開く。
4. iPhone Safariでホーム追加、機内モードで起動・記録・再起動・JSON復元を確認。

Vite base・manifestのscope/start_url・Service Workerのナビゲーション対象をすべて `/takin-2ku/` に統一。HashRouterなので `/#/history` 等の再読み込みでPagesの404を回避します。ロールバックはmainの変更をrevertして再デプロイします。PublicリポジトリとGitHub標準ホストランナーの無料構成です。

## テストの範囲と未実装

Vitest：RIR 0/null・全0.5刻み・範囲・入力エラー、単位変換、DB保存と再オープン、全データ復元と重複/競合、不正インポート、v1 DB/JSON移行、デモ分離、増量上限/痛み/疲労、集計。React Testing Libraryで日本語UIとデモ切替を検証します。

Playwright：390px幅のChromiumで、本番Service Worker経由のオフライン起動、セッション作成、RIR 0/未入力、編集・削除・再読み込み、履歴、デモ分離、メニュー作成、Firebase未設定の動作を検証します。

実行結果：`npm install` 成功、`npm run build` 成功、`npm test` 14件成功、`npm run test:e2e` 3件成功。E2Eでは削除取り消しと「承認前は変更なし・承認後のみメニュー更新」も確認しました。`npm audit --omit=dev` は0件。開発用のWorkboxビルド依存には監査上の低/中程度の指摘が残っており、実行時依存とは分けて管理します。

**iPhone実機のSafari・ホーム画面追加・プライベートモード・新旧Service Worker更新の実機確認は別途必要**です。Chromiumでの成功を実機検証済みとは表現しません。

Phase 2：Googleログイン、Firestore同期・競合選択画面・Security RulesのUID別テスト。Phase 3：AppleショートカットのHealth JSON入出力。外部LLM、個人最適化モデル、予測誤差評価、睡眠との散布図、Health自動同期は未実装です。CSVはセット形式のみで、完全復元にはJSONを使用してください。健康データを本人の同意なく外部へ送りません。

`.env*`、秘密鍵、ローカルバックアップ、依存関係、ビルド成果物、ブラウザテスト出力はコミット対象外です。
