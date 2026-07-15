# REALPROOF 共通リファレンス(全エージェント必読・単一情報源)

> すべてのサブエージェントは**作業前にこのファイルを必ずReadする**こと。
> サブエージェントは親の会話を引き継がない=このファイルが唯一の共有知識。

---

## 0. 最上位の思想

- 症状→真因→対策の順で考える。推測の羅列は価値ゼロ。**真因を1つ言い切る**
- 確定できないことは「コードを見ないと分からない」と正直に書く。捏造しない
- CEO(宮崎ほくと)の運用判断は一次的に正しい。反論はコード/事実の根拠を先に出す

---

## 1. 絶対ルール(違反=即失敗)

### git / ビルド
- **main直接コミット**。ブランチ・worktree作成禁止
- **`git push` 禁止**(CEOがGitHub Desktopで手動)
- **`npm run build` 禁止**(CEO手動)。型チェックは **`npx tsc --noEmit` のみ**
- 1修正 = 1コミット

### コード規約
- Supabase: **`.maybeSingle()` 必須**(`.single()` 禁止)
- 新規APIルート/新規ページ: 冒頭に **`export const dynamic = 'force-dynamic'` 必須**
- `fetch`: **`cache: 'no-store'` 必須**
- `useEffect` 依存配列: **プリミティブのみ**(オブジェクト/配列を入れない)
- **新パッケージのimportを既存APIファイルに追加しない**(Webpackチャンクグラフが壊れClerk middlewareを破壊した事例あり。新importは新規ファイル側に置く)
- 外部向けURLは `https://realproof.jp` をハードコード
- 認証・登録後リダイレクトは地雷原。判定失敗時は必ず **fail open**(=ダッシュボードへ通す)。新規ログインをブロックしない

### 禁止コマンド
- **`sed` 禁止** → `str_replace` を使う
- **`cat .env.local` 禁止**。環境変数の値をチャット/出力/ファイルに絶対書かない。存在確認は `grep -c` で件数のみ、キー名は `grep -o '^[A-Z_]*='` のみ
- **SQLをエージェントが実行しない**。SQLは提示のみ→CEOがSupabase SQL Editorで手動実行

### DB破壊防止(事故から学んだ規律)
- **DELETE前に必ずSELECTで対象を確認**→CEO明示承認待ち(村上さん投票誤削除事案)
- **DROP/ALTER前にCOUNTで件数確認**
- **DROP COLUMN前に `column_default` を確認**(神山事件: コード参照ゼロでも旧デフォルト値で新規INSERTに混入)。安全手順: `SET DEFAULT`(除去) → `UPDATE` → `SELECT`全件確認 → `DROP`
- **新規カラムにDEFAULTを付けない**(想定外INSERT混入を防ぐ)
- PITR未契約=バックアップ前提なし。RLS無効・全アクセスservice_role=管理者権限フルパワー。**破壊は取り返しがつかない**前提で動く

### Supabaseの罠
- 1000行サイレントキャップ → 大量走査は **`.range()` + `.order('id')`** でページネーション必須
- **存在しないカラムをSELECTするとサイレントにnullを返す**(エラーにならない)。カラム名は下記で必ず照合

---

## 2. DB実カラム名(指示書を書く前に必ず照合)

| テーブル | 実在カラム | 罠(存在しない/誤りやすい) |
|---|---|---|
| `professionals` | `user_id`, `contact_email` | ❌ `email` は無い→`contact_email` |
| `clients` | `user_id`, `nickname`, `last_name`, `first_name` | ❌ `email` 無し |
| `nfc_cards` | `card_uid`, `professional_id`, `status`, `linked_at`, `user_id` | status: unlinked/active/lost/deactivated |
| `org_members` | `invited_at`, `accepted_at`, `removed_at`, `credential_level_id` | ❌ `created_at` 無し |
| `votes` | `auth_provider_id`(投票者特定) | ❌ `voter_user_id` 無し |
| `my_proof_items` | `user_id`(紐付け) | ❌ `card_id` 無し |
| `credential_levels` | (バッジ定義の実体) | ❌ `professional_badges` テーブルは存在しない |

- バッジ = `credential_levels`、プロへの紐付け = `org_members.credential_level_id`
- ❌ `org_badge_levels` テーブルは存在しない

---

## 3. 技術スタック / 環境

- Next.js 14 App Router / Supabase / Clerk(LINE・Google・Email・SMS) / Vercel / Resend / LINE Messaging API
- リポジトリ: `~/dev/forte-mvp`(iCloud同期フォルダ内不可の教訓済み)
- Supabase project ref: `<PROJECT_REF>`(実値はCEO環境の設定を参照。ファイルに実値を書かない)
- Resend送信元: `REAL PROOF <noreply@realproof.jp>`
- LINE Flex Message禁止プロパティ: `letterSpacing` / `lineHeight` / `padding`(400エラー)
- iOS PWA×Clerkは自前ticketフロー(PwaLineSwap→signInToken→setActive)

---

## 4. STOPゲート(全実装フローで死守)

各フェーズ末に 🛑 STOP。CEO承認まで次に進まない。人間ゲートを残すのは以下3点(自動化しない):
1. **本番SQLの実行**(エージェントはSQL提示まで。実行はCEO)
2. **`git push`**(CEO手動)
3. **`npm run build` / デプロイ**(CEO手動)

---

## 5. ⚠️ 型チェック(tsc)運用 — 当てにしない前提

- **主軸は「既存の"通っているコード"に構造的に合わせる」+ rp-reviewerの目視チェック**。tscは補助。
- `npx tsc --noEmit` は**打てれば打つ**が、この開発環境は `node_modules` 無しで**動かない場合が多い**。動かない時は **`npm install`しない**(ツリー/環境破壊リスク)。
- tscを"安全網"として前提にしない(偽の安心を避ける)。型の芽は既存パターン準拠とレビューで潰す。
- 最終的な型チェックが要る時はCEOが手元(Mac)で `npx tsc --noEmit` を1回実行する運用(緑=OK)。

## 6. Admin(管理者)機能の認証方式 ★Clerkではない

- `/admin` 配下は **Clerkではなくパスワード保護**。cookie `rp_admin_auth` の値が `'authenticated'` かで判定。
- 各admin APIはこのヘルパーを持つ:
```typescript
async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get('rp_admin_auth')?.value === 'authenticated'
}
```
- `src/middleware.ts` が `/admin` をパスワード保護(loginPath: `/admin/login`)。非管理者は **401**。
- 新規admin API/画面は必ずこの方式を踏襲。手本: `src/app/api/admin/certification-card/ship/route.ts` / `card-orders/ship/route.ts`
- admin新機能の型: `export const dynamic='force-dynamic'` + `checkAdminAuth()` + `getSupabaseAdmin()` + `.maybeSingle()`

## 7. データ取得アーキテクチャ(踏襲)

- **Server Componentから直 service_role で読まない**。**API route経由 + クライアント `fetch(cache:'no-store')`** が既存の型。
- Supabaseクライアントは `getSupabaseAdmin()`(`cache:'no-store'` 設定済み)を使う。
- 一覧の基本は `.order('created_at',{ascending:false}).limit(500)`。1000件超えそうなら `.range()+.order('id')` へ。

## 8. `card_orders` テーブル(NFCカード購入者・Stripe由来)

コード確認済みカラム: `id`(UUID PK) / `created_at` / `customer_name` / **`email`**(※card_ordersには有る) / `shipping_address`(**JSONB**・Stripe shipping_details由来) / `amount` / `status`(**`'paid'`/`'shipped'`**) / `shipped_at`(未発送null) / `professional_id`(uuid/null=登録済プロ紐付き) / `stripe_session_id`(**UNIQUE**・冪等キー) / `stripe_payment_intent` / `clerk_user_id`(text/null)
- INSERT経路: `src/app/api/webhooks/card-order/route.ts`(status='paid'固定)。`stripe_session_id` UNIQUE衝突(`23505`)は処理済みとして200。

## 9. 発送ラベルは2系統(混同禁止)

- `/admin/card-orders` … **NFCカード購入者**(`card_orders` / Stripe由来)。宛先整形は `parseRecipient()`
- `/admin/certification-labels` … **認定申請者**(`certification_applications`)。宛先整形は `recipientFromApplication()`
- 共通純粋関数は `src/lib/shipping-label.ts`(`LABEL_SENDER` / `ParsedRecipient` を共有)
- ラベルPDFは **`pdf-lib` + `html2canvas`(クライアント側)**。**jsPDF不要**。寸法定数は `card-orders/page.tsx` の `CELLS`/mm定数(行間0で現物確定)。**既存PDF実装は触らない**

## 10. 調査技法(教訓A/B/C=二度と同じ事故を起こさない)

- **着手前に必ずPhase 0調査**。指示書の「前提」は現状と食い違うことがある(既に実装済みを二重実装→既存破壊の実例あり)
- **ワーキングツリーとHEADは食い違う**。`ls`/Readを鵜呑みにせず、ファイル所在は **`git log --oneline -- <path>`** と **`git show <commit>:<path>`** で確定
- **「分離/リネーム」リファクタ時は分離元の受け皿を必ず残す**(購入者ページがオーファン化して消滅した実例あり)

---

## 11. 追加教訓(2026-06アーカイブ由来)

### 調査
- **コードに無いロジックは「DB側(トリガー/関数)」を疑う**。`grep` 0件でも「ロジック無し」ではない(Founding Member判定は `votes` の AFTER INSERT トリガー+関数が本体だった)。DROP前に必ず `CREATE OR REPLACE ...` 定義を丸ごとSELECTで保存する
- **画面が「0 / SAMPLE DATA」= データ破損を先に疑わない**。まずブラウザConsoleエラーと表示モードバッジ(SAMPLE/LIVE)を見る(過去は `range is not a function` でサンプルにフォールバックしていた=投票データは無事)
- **サーバー側通信はブラウザNetworkタブに映らない**(検索/admin集計はサーバー内→Supabase)。見えるのは「ブラウザ→自サイト/api」まで

### DB / デプロイ
- **デプロイ順序は DB先 → コード後**。新カラムを参照するコードをカラム追加前に本番反映すると `42703` で落ちる
- **後方互換: 既存関数への新引数は必ずオプショナル**(既存呼び出しが無改修で動くこと)
- **`Promise.all`/クエリ集合の要素数(arity)を崩さない**。死んだプレースホルダは新クエリに置換・改名して数を保つ(要素を足し引きすると下流の分割代入がズレる)
- **本番バックフィルの安全プロトコル**: 全件ロード→snapshot保存→dry-run→行ごとtry/catch→「null=0」をゲートに本実行→完了後検証→一次情報を見てから不可逆操作

### Supabaseクライアントは2種類(混同厳禁)
- サーバー(API routes): `getSupabaseAdmin()`(`.range()` あり・`cache:'no-store'`)
- ブラウザ: `createClientComponentClient()`(自前プロキシ `ClientProxy` → `/api/db` 経由)
- 用途を取り違えるとメソッド不在(`range is not a function` 等)で落ちる

### votes は不可侵 ★思想
- **`votes` テーブルは書き換え厳禁**。`proof_hash` によるハッシュチェーンがある。方式刷新(パーソナリティのタイプ制移行等)でも votes 無改変を貫く
- 過去票を別方式へマッピングするのは「捏造」。方式刷新時は0スタート(旧 `is_active=false` + 新INSERT別id)が誠実

### 画像URLの罠
- **揮発する外部CDN URL(`images.clerk.dev` / `img.clerk.com` 等)をDBに保存しない**(Clerk移行で孤立=画像切れ)。OAuth取得時に1回フェッチ→Supabase Storageへコピー→**永続public URL**を保存。ヘルパー `src/lib/server-image.ts` の `persistExternalImage()` を通す
- カラム名: プロ写真 = **`professionals.photo_url`**(❌`image_url`)、投票時客写真 = **`votes.client_photo_url`**
- avatars(固定パス)は `cacheBust` 必要 / client-photos(ユニーク)は不要

### 投票ページの認証(自前OAuth)はブラウザ環境依存
- ソーシャルOAuth(LINE/Google)はユーザーのブラウザ環境で壊れる。**許可リスト方式**(`src/lib/oauth-browser-allow.ts` の `shouldShowOAuth()`)で、標準ブラウザ時のみOAuth表示・非標準(WebView/アプリ内)はSMS→メールコードへ逃がす
- Googleブロックは2種類(同意画面Testing / `disallowed_useragent`)。LINEの「ログイン警告」は自動ログイン失敗が真因(REALPROOF起因ではない)
- UA判定の罠: 旧Android標準ブラウザは `Mobile Safari` を僭称。iOS Safari判定はApple端末トークン必須
- ※適用は投票ページの自前OAuthのみ。プロのサインアップ/ログイン(Clerkホスト型)は対象外

### スコープ規律
- 機能を「足す」時は、**古い表示の撤去も同じスコープで確認**(移行時の残骸=オーファンが後で必ず悪さする)

> 各テーブルの詳細カラム定義(personality_items / votes全カラム / page_views / tracking_events / founding_member系)はNotion「開発アーカイブ_04_2026-06」を参照。

---

## 12. 追加教訓(2026-05アーカイブ由来)

### DB安全(最重要)
- ⭐ **Supabase Web SQL Editorの `BEGIN;` は信頼できない**。本物のトランザクション/ロールバック安全網として当てにしない(=`BEGIN; ... ROLLBACK` を"保険"にした提案をしない)。守りは「確認SELECT → CEO承認 → 本番文」の分離で担保する
- **revert可能な作業とrevert不能な作業を分離**する。不能(DROP/削除/本番UPDATE)は特に snapshot・最終SELECT・段階分解を厚くする
- 実行直前の**最終SELECTは必ず**やる(件数と中身を目視してから本番)

### ワークフロー規律
- **「ついでに直す」は禁止**。指示スコープを厳守し、別の気づきは別タスク/別STOPに切り出す
- **既存APIは極力触らない**を優先(触る場合も影響最小)。複雑変更は Phase 1+2 方式(調査→実装を分割)
- **JSX構造の精密削除は `view` 必須**。行番号頼みの削除は構造崩壊を招く。前後の実コードを見てから削る
- **`git commit -m "…"` を必須**(`-m` 省略はエディタ起動でClaude Codeが固まる/クラッシュする)

### 環境
- **Vercel: Production Overrides の Install Command を空欄にしない**(既知の落とし穴)

### 追加テーブル(実在)
- `bookmarks`(ブックマーク) / `my_proof_cards`(マイプルーフカード) が存在
- `/api/db`(汎用エンドポイント): ブラウザ側の書き込み経路。`POST /api/db { action: 'delete'|'insert'|... }`。`createClientComponentClient()` の裏側
- LINE Flex 許可フィールド: `text` / `box` / `button` / `action`(＋禁止: `letterSpacing` / `lineHeight` / `padding`)

---

## 13. 追加教訓(2026-02〜03初期アーカイブ由来)

### キャッシュの二層(超頻出)
- **`export const dynamic='force-dynamic'` はVercel側キャッシュ対策。ブラウザのfetchには効かない**。ブラウザ側は各 `fetch(..., { cache: 'no-store' })` が別途必要。特に**SafariはGETを積極キャッシュ**する(iPhoneで「古い値が出続ける」)
- 「DBは正しいのにアプリが古い結果を返す」= Verc/ブラウザキャッシュが第一容疑。**検証法: API URLをブラウザで直接開き、返るJSON件数とDB件数を比較**(ズレたらキャッシュ確定)
- 横断設定(cache/timeout/header)は個別APIに書かず `src/lib/`(例 `getSupabaseAdmin()`)に集約

### FK制約とJOIN(サイレント失敗)
- **FK制約が消えるとSupabaseの `.select('relatedTable(...)')` JOINが空を返す(エラー無し)**。Clerk移行のuser_id型変更でFK一括削除→巻き添えでprofessional_id FKまで消えた実例
- 「JOINが空」は `information_schema.table_constraints` でFK有無を確認。必要FKは再作成

### git / デプロイ
- **`git revert` は新規作成ファイルを消さない**(既存変更のみ逆転)。revert後は `git diff <before> HEAD --name-only --diff-filter=A` で新規残骸を確認→ `rm -rf` で手動削除
- **新規ファイルはコミット前に `git status` でUntracked確認**。add漏れは本番404(`npm run build`はローカルを読むので通ってしまい気づけない)
- import追加でWebpack chunkが変わりClerkがランタイムで壊れることがある(ビルドハッシュ同一なのに動作破壊=ランタイム問題と切り分け)

### Clerk 具体
- email取得: `user.primaryEmailAddress?.emailAddress`(❌`user.email`)
- 認証済み判定: `isSignedIn`(❌`user!==null`)。ログアウト検知: `isLoaded && !user`(初期状態と区別)
- `useEffect` 依存に `useUser()`/`useAuth()` のオブジェクトを入れない(毎レンダー新参照→無限実行)。`isLoaded`(boolean)+ `loadedRef` で初回1回に制御
- **LINE/電話番号で登録した人はメールが無い**(Clerkにemail無し→`contact_email` null)。メール依存機能はフォールバック必須。セルフ投票チェックはメール照合でなく **user_idベース**
- ClerkのSMS/メールテンプレは「Delivered by Clerk」ONだと本文カスタム不可

### 設計・実装規律
- **同じ判定ロジックを2箇所に書かない**→共通hook(例 `useProStatus`)に集約
- **バリデーションは表示時(フロント)+送信時(サーバー)の2層**(片方だけはバイパスされる)
- **DBへの書き込みは最終確認後に1回だけ**(pending INSERT→後更新は中途半端レコードの温床。投票はコード認証成功後に1回INSERT)
- **リネームは表示テキストのみ**変更。変数/state/URL/テーブル/カラム名は変えない
- **UI問題はまず引き算**(タブ7→2の実績)。「見るだけ(タブ)」と「操作する(メニュー)」を分離。設定画面には1行のWhy説明
- **横断データ修正(DB+外部API)は専用APIエンドポイント**で(Clerk連携backfill等。認証キー保護・結果JSON・再実行安全)。SQL単体で無理な処理をSQLで無理にやらない
- メール認証は**リンク方式でなくコード入力方式**(モバイル/キャリアメール相性)
- **Resendは送信専用**(返信は届かない。reply-to設定 or 「返信不可」明記)

### 不正防止クエリ(投票系)
- WHERE句は「**何を防ぎたいか**」を言語化してから: 組織票=voter+時間(proは含めない) / 重複=voter+pro / 連続=voter
- 照合は **`normalized_email`**(正規化済)。`voter_email`(生値・表示用)では大小文字/ドット揺れを吸収できない
- 投票INSERT前チェックリスト: ☐30分クールダウン(normalized_email・全プロ横断) ☐重複(normalized_email+professional_id) ☐セルフ投票(user_id) ☐QR期限 ☐1日3プロ制限

### 一括置換・削除(破壊的)
- **テーブル/カラム名の一括置換前にDB実態を確認**。DB側変更(RENAME)完了を確認してからコード置換(存在しない名前への一括置換で全機能停止→データ消失した実例)
- **DELETE系は「定義」と「紐付け」を区別**: `credential_levels`(バッジ定義=消すな) vs `org_members`(紐付け=revoke時に消してよい)。`organizations`(団体定義=消すな)

### カラム名の罠(追加・error-prone)
- `professionals.name`(❌`line_display_name`/`display_name`) / `clients.nickname`(❌`name`)
- `votes.selected_proof_ids`(❌`selected_proofs`・TEXT[]) / 照合は `normalized_email`
- `rewards.reward_type`(❌`category`) / `vote_emails` は `professional_id`+`email` で管理(❌`vote_id` 無し)
- `organizations`: `id/name/type/owner_id/description`。**`type` で機能分岐**(`store`=バッジ管理非表示 / `credential`・`education`=表示)。「バッジ管理が出ない」報告はまず `organizations.type` を疑う(SQL1行UPDATEで即反映)
- `credential_levels`: `id/name/image_url/description/organization_id/claim_token`

### 診断
- **Vercel Logs の External APIs セクション**で外部API呼び出しの有無が一目(期待コールが無い=そのパスに未到達)。console.log再デプロイより速い
- 実ユーザーのバグ報告は**まず対象レコードをSQLで確認**(name/contact_email/user_id/登録経路)→原因特定→コード。DB→API→Frontendの順
- Vercel Function Region は日本向けなら **Tokyo(hnd1)**(US iad1だと往復で体感+3秒)。パフォーマンス優先順位: ①物理(リージョン/CDN) > ②アーキ(キャッシュ/RPC) > ③クエリ最適化

> 各インシデントの詳細・投票系テーブルの全削除順序等はNotion「開発アーカイブ_01_2026-02〜03」を参照。

---

## 14. 追加教訓(2026-04アーカイブ由来・新規分のみ)

### 機密・PII
- **dry_run/バックフィルの結果JSON全体をチャットや出力に貼らない**(過去投票者のメール等PIIが漏れる)。返すのは件数・skipped理由・errorsの**サマリのみ**
- **指示書のコード例に実 `process.env.X` の"値"を書かない**(展開・漏洩事故)。キー名のみ
- チャットUIは文字列を自動リンク化する(メール/URL)。貼付け=漏洩の入口になりうると意識

### コード規約(追加)
- **TypeScript判別共用体(discriminated union)は環境次第で絞り込みに失敗**することがある→将来のフィールド追加も安全な**flat型を優先**
- **重複防止はDBの UNIQUE制約**で(アプリ側チェックだけだと race condition。例: 重複投票)
- `display_mode='hidden'` = コメント非公開の意味。集計・Schema.org出力は `status='confirmed'` で絞る(pendingを混ぜない)
- **バッジ/新機能はUIより先にDBスキーマを確定**(旧カラム `is_double_expert` 等と新カラムの混在事故)
- Resendは**SDKでなく fetch 直叩き**が既存パターン

### 集計・ランキング
- 率と母数の両立は **Wilson Score**(母数少の高率を過大評価しない)
- **表示とソートのデータソースを統一**(分子=session_count自己申告 / 分母=unique実測、のような別ソース混在を避ける)

### フロント
- フォント強制は `!important`(Tailwindの baseStyles が font-weight を上書きするため)

### 配信(メール)運用
- 送信ドメインは **SPF/DKIM 必須**(未設定でBounce急増)。送信ドメインのDNS所在を勘違いしない(リブランドのDNS残骸に注意)
- Resendの `estimated_send_time` は楽観値。docomo等一部キャリアの数%はvalidationで弾かれる前提

### CEO手元運用(Claude Codeに投げない/CEO側の注意)
- ローカル確認は `rm -rf .next && npm run build` をセットで(`.next` キャッシュ由来の誤動作回避)
- **`.env.local` は絶対消さない**。`rm -rf` はカレントディレクトリを厳重確認(ホームで実行して消した事故)
- 新ターミナルはホームで開く→コマンドは毎回 `cd ~/dev/forte-mvp` を含める。コマンドにバッククォート混入でzshが固まる点に注意
