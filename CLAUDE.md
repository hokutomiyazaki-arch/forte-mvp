# REALPROOF 開発ルール（forte-mvp 専用）

> グローバル共通ルール（コミュニケーション・診断規律・破壊的操作の5段階など）は
> `~/.claude/CLAUDE.md` 側に集約済み。このファイルには **REALPROOF 固有** のことだけを書く。
> 各項目の背景・コード例・過去インシデントは `LESSONS.md` 参照。

## 🚨 絶対ルール（最優先）
- **ブランチを作らない。常に main に直接コミット。** worktree も作らない。`git checkout -b` は使わない。
- **CC は自動で commit / push しない（最優先・絶対）。** CC はファイルを編集するところまで。`git add` / `git commit` / `git push` は実行しない。commit と push はほくとが GitHub Desktop で行う。
  - CC は編集後に「どのファイルを変更したか」を報告するだけ。git 操作の代行が必要なときは、ほくとが明示的に指示した場合のみ。
- `npm run build` はしない → ほくと手動。型チェックのみ `npx tsc --noEmit`。
- 各 🛑 STOP ポイントで CEO 承認待ち。DB 操作（Supabase SQL Editor）・本番検証はほくたが実施。

## 鉄則
- `getUser()` は使わない。常に `getSession()`。
- `.single()` は使わない。常に `.maybeSingle()`。
- 新規 API route には `export const dynamic = 'force-dynamic'` 必須。
- `fetch` には `cache: 'no-store'` 必須。
- `useEffect` 依存配列は**プリミティブのみ**（オブジェクト/配列 禁止 → 無限ループ）。
- 1修正=1コミット。「ついでに直す」は別タスクに分離。
- 認証・非同期処理の前に `const snapshot = buildXxx()` で全 state を固定（stale state 対策）。
- DB INSERT は最終確認後に**1回だけ**。「pending → 後で更新」パターン禁止。

## 認証の注意（Clerk / LINE）
- signUp と signIn は別コードパス。`login/page.tsx` は地雷原。変更時は全フロー確認。
- 遷移は `router.push()` ではなく `window.location.href`。
- Clerk 認証パターン：`auth()` → `professionals` を `user_id` で絞る。
- **LINE Login の user ID ≠ LINE Messaging API の user ID**（別物）。
- **iOS PWA × Clerk 標準ソーシャル OAuth = `authorization_invalid` で死ぬ**（Clerk が OAuth state を cookie 保持 → PWA の storage 分離で戻り時に読めない）。
  - 回避＝自前 ticket フロー：`/api/auth/line/start`（素302・state を URL 埋め）→ callback で `signInTokens.createSignInToken` → フロントで `signIn.create({strategy:'ticket'})` → `setActive`。cookie 非依存で PWA でも通る。
  - PWA 時のみ `PwaLineSwap.tsx` がカード内 Clerk-LINE ボタンの click を capture で乗っ取る（Clerk はボタンを非同期描画するので `MutationObserver` で付け直し必須）。
  - **通常ブラウザは何も乗っ取らない**（従来通り）。ここは触らない。
- `useSearchParams` を使うページは `<Suspense>` でラップ必須。

# ============================================================
# 🛑 頻発バグ防止チェックリスト
# ============================================================

## A. キャッシュ・SSR（Vercel）
- [ ] 新規 API route には `export const dynamic = 'force-dynamic'`。
- [ ] Supabase の fetch wrapper に `cache: 'no-store'`（`getSupabaseAdmin()` に設定済み）。
- [ ] 「データが反映されない」→ **Step 0 はハードリフレッシュ**（Cmd+Shift+R）。
- [ ] **「Ready」表示 ≠ 最新ビルド配信**。挙動が変わらない時は **Use existing Build Cache を外してクリーン再デプロイ**。
- [ ] OGP画像/バッジは `?v=N` でキャッシュバスト（LINE は特に強烈にキャッシュ）。
- [ ] Vercel Function Region は `hnd1`（東京）。米国だと +3秒。
- [ ] **静的ファイル読み込み**：`fetch(new URL(..., import.meta.url))` は Vercel Node ランタイムで `file://` になり失敗 → **`fs.readFile(process.cwd() + '/public/...')`** を使う。
- [ ] 外部に配るURLは **`origin` でなく `realproof.jp` をハードコード**（preview デプロイのURLが顧客に届くのを防ぐ）。
- [ ] 調査順序：**キャッシュ排除 → API直叩き → DB → コード**。

## B. State管理（React）
- [ ] `useEffect` 依存配列にオブジェクト/配列を入れない。
- [ ] 認証/非同期の前に `const snap = buildVoteData()` で snapshot。送信処理は snapshot のみ使用、useState を再読み取りしない。
- [ ] **配列を破壊的に触らない**（`votes.sort()` ではなく `[...votes].sort()`）。
- [ ] 同一目的のデータ組み立ては共通関数に集約。コピペは必ずズレる。
- [ ] `onAuthStateChange` と `useEffect` を併用しない（競合してフリーズ）。

## C. DB・Supabase スキーマ落とし穴
- [ ] **存在しないカラムを SELECT しても null が返る**（エラーにならない）。カラム名確認は `information_schema.columns` で実態を見る。
- [ ] よくある誤推測：
      `display_name` ❌→`name` ✅／`email` ❌→`contact_email` ✅／`image_url` ❌→**`photo_url`** ✅（professionals）／
      `clerk_user_id` ❌→`user_id`(TEXT) ✅／`selected_proofs` ❌→`selected_proof_ids`(TEXT[]) ✅／`voted_at` ❌→`created_at` ✅
- [ ] `clients` テーブル：`user_id / nickname / last_name / first_name`（**email カラム無し**）。
- [ ] `org_members`：`invited_at / accepted_at / removed_at`（**created_at 無し**）。
- [ ] `votes`：voter 識別は **`auth_provider_id`**（`voter_user_id` は無い）。
- [ ] **存在しないテーブル**：`professional_badges` / `org_badge_levels` は実在しない。
      バッジ定義＝**`credential_levels`**／バッジ割当＝**`org_members.credential_level_id`**。
- [ ] **VIEW（INSERT/UPDATE 不可）**：`vote_summary` / `active_ranking` / `personality_summary`。
- [ ] `vote_summary` は **`vote_type='proof' AND selected_proof_ids IS NOT NULL`** で絞る → personality_only / hopeful 票はカウントに出ない。
- [ ] `org_members` JOIN は **必ず DISTINCT**（1プロ×バッジ数だけ複数行）。重複削除は3カラム `(organization_id, professional_id, credential_level_id)` で（下の事故教訓参照）。
- [ ] 検索・重複チェックは `normalized_email`、`voter_email` は表示用。
- [ ] `professionals` 全クエリに `.is('deactivated_at', null)`（自分/ID指定/管理画面は除く）。`deactivated_at` = ソフトデリート（null=active）。
- [ ] FK制約が消えると `.select('table(...)')` の JOIN がサイレントに空を返す。
- [ ] timestamp カラムに文字列を入れない（`'expired'` ❌ → `new Date().toISOString()` ✅）。
- [ ] **Supabase の暗黙キャップ `max-rows=1000`**：`.limit(10000)` を信じるな。**1000件超は必ず `.range()` + `.order('id')` でページネーション**（ORDER BY の無い LIMIT/range は非決定的で intermittent バグの元）。5/28 の検索バグの真因。
- [ ] カテゴリ表示名は DB でなく **`src/lib/constants.ts` の `TAB_DISPLAY_NAMES`**。
- [ ] 効果カテゴリは**9種**（治療・回復/体の機能改善/ボディメイク/パフォーマンス/マインド/発見・気づき/指導力/ビューティー/栄養・生活）・**85項目・最大9選択**。
- [ ] `vote_type` は `hopeful` / `proof` / `personality_only` の3種。

## D. 外部連携（LINE / Email / mailto）
- [ ] LINE 内蔵ブラウザは callback が2回発火 → 冪等性／中断リカバリ。
- [ ] LINE 初回送信は reply、**2回目以降は push**（`line_user_id` 永続化必須）。
- [ ] **LINE Flex Message で `letterSpacing` / `lineHeight` / `padding` は使えない**（400 エラー）。
- [ ] mailto: 各パラメータを個別に `encodeURIComponent()` + `&` 連結。PC では動かないことがある（QR/スマホ前提）。
- [ ] Resend は送信専用。返信必要なら `reply-to` or 「返信不可」明記。認証はリンククリック NG → **6桁コード入力**。
- [ ] API レスポンスに `voter_email` / `normalized_email` / `voter_phone` を**絶対含めない**。

## E. DB破壊的操作（REALPROOF 固有の追加）
- グローバルの5段階に加えて：
- [ ] **Supabase SQL Editor で BEGIN/COMMIT を分けない**（セッション境界で ROLLBACK される）。`RETURNING` で実行＆確認する。
- [ ] **PITR 未契約**（5秒粒度の復元不可）、daily backup は前日深夜のみ。
- [ ] **DROP COLUMN 安全プロトコル（神山事件）**：① 新値へ `SET DEFAULT` → ② 残存レコードを `UPDATE` → ③ `SELECT` 全件確認 → ④ `DROP`。
      ※ `column_default` が残ると、コード側から参照ゼロでも新規 INSERT が旧値を運ぶ。
- [ ] **テストデータ削除順**：`voice_shares` → `vote_confirmations` → `votes`（`vote_emails` はスキップ、VIEW は削除不要）。

## F. 投票パス・バリデーション（追加・修正時）
新しい投票パスは **クライアント5 + サーバー3 = 計8パス**全てに同じ検証を適用。INSERT 前に必ず：
- [ ] QRトークン検証（**`used_at IS NULL`** + `expires_at > NOW()`、Set 1）
- [ ] セルフ投票チェック（`user_id` ベース）
- [ ] voter単位30分クールダウン（**`normalized_email`** で、professional_id で絞らない）
- [ ] プロ単位30分クールダウン（Set 2）
- [ ] 重複投票チェック（`normalized_email` + `professional_id` の UNIQUE）
- [ ] 1日3プロ制限
- [ ] INSERT 後に `markTokenUsed*` を呼んで `used_at` 記録（Set 1 出口）
- [ ] `vote/[id]` の動的セグメントは **`professionals.id` の UUID**（slug 変換なし）。

指示書に「Nパス」と書いても **grep で実装網羅性を確認**（過去にパス漏れあり）。

## G. デッドコード・コード一貫性・チャンクグラフ
- [ ] 「デッドコードかも」判定は**3点証拠**：① grep ② UI導線（router.push/redirect）③ コミット履歴。
- [ ] 「ほとんど同じだけど少し違う」実装は diff 時点で共通化。
- [ ] **API ファイルへの新規 import は Webpack のチャンクグラフを変え、Clerk middleware 検出を壊すことがある** → 新 import を足すより、**既存の共通関数の中に `cache: 'no-store'` を入れる**方を優先。

## H. 新しい error code を追加する時の3点セット
`?error=xxx` を返すなら**必ず3つ揃える**：① callback/API 側の error 出力 ② フロントの error mapping（`vote-error-messages.ts`）③ 表示文言 + ハンドラ。1つ抜けるとサイレントに「不明エラー」or「auth_invalid」に落ちる。

## I. 触ってはいけない既存実装（明示保護リスト）
- 検索ハイライト（`?highlight=...`）
- リピーター/常連マーク表示
- ハッシュチェーン関連
- 既存の認証フロー
- 既存の RewardReveal / RewardContent
- **既存 QR 投票フロー**（`/vote/[token]`。オンライン投票 PIN は別導線として追加済み、QR 側は触らない）
- **PWA×LINE の ticket フロー / `PwaLineSwap.tsx`**
- 認定カード / 証明書自動生成システム

新機能の指示書には**最初にこのリスト**を書く。

## ⚠️ スケール既知リスク（X-Day 前に対応）
- `/api/search` 等の「professionals 全件 → `.in(proIds)` で votes 全件取得 → JS 集計」は、35,000プロ規模で **`.in()` の URL 長 + メモリ**で破綻する。**Postgres 側集計（RPC/VIEW）へのリファクタが必須**。

# ============================================================
# Organization Feature（団体機能）
# ============================================================

## 4つの絶対原則
1. **プルーフの所有権は常に「個人」。** 団体はビューレイヤーのみ（所有・管理・削除権なし）。
2. **団体独自のプルーフは存在しない。** 個人プルーフの集約が団体のプルーフ。団体カテゴリを足した瞬間「手間のかかる Google 口コミ」になる。
3. **団体QRは存在しない。** プロのQRが唯一の投票入口。
4. **REALPROOF はバッジを作らない。** 発行・表示・証明するインフラを提供する（Shopify モデル）。

## 変更禁止リスト（Organization 実装時）
`professionals`（store_id 追加しない）/ `votes` / `rewards` / `client_rewards` / `qr_tokens`（団体QR作らない）/ `vote_summary` / 投票フロー（`/vote/[token]`）。

## 新テーブル
`organizations`（type: store/credential/education）/ `org_members`（status: pending/active/removed）/ `org_invitations` / `credential_levels`（バッジ定義）。

## ロール / RLS
- `owner`：団体オーナー。オーナーが同時にプロなら org_members に `is_owner=true` で自分も追加。
- オーナーは自団体の org_members/org_invitations を管理可。プロは自分の所属を閲覧可。
- プロは「店舗」からのみ自分で離脱可（資格バッジは団体のみ管理）。
- オーナーは個別コメント・リワード設定・QRコードを**閲覧不可**。

## フェーズ
- Phase 1A：店舗オーナーのコア（登録・招待・ダッシュボード・公開ページ）
- Phase 1B：Badge Self-Service（credential_levels・claim URL・バッジ管理）
- Phase 2：Analytics + Search + 有料プラン

## 教訓：org_members 重複削除事故（2026-03-13）
org_members は 1プロ=複数行（バッジごと1行）。重複削除で `DISTINCT ON (organization_id, professional_id)` を使うと正当なバッジ行（advance/master/TBU）まで消える。**必ず3カラム `(organization_id, professional_id, credential_level_id)`**。3/13 に advance/master/TBU 消失 → 手動 INSERT 復旧。

# ============================================================
# 詳細リファレンス
# ============================================================
このファイルの各チェック項目の背景・コード例・過去インシデント詳細は `LESSONS.md` 参照。
新しい教訓を得たら LESSONS.md に追記し、このファイルにはチェック1行だけ反映する運用。
