# リフェラル機能 Phase 0 調査結果

- 実施日: 2026-07-31
- 対象: `docs/referral/RP_REFERRAL_IMPL_SPEC.md` §1（事前調査タスク3件）
- 方法: rp-investigator によるコード調査 ＋ Supabase への読み取り専用クエリ（GET のみ・書き込みゼロ・PII は集計値のみ出力）
- DB 全件走査は 1000 行ページネーション（`order=id` + offset）で実施

---

## §1-1 クライアント⇔プロの紐付け

### 結論
**「クライアント → 最初に投票したプロ」を引く JOIN は現状不成立。**
既存プルーフからの招待網（アトリビューション台帳）の遡及再構築は、現行スキーマ・現行データではできない。

### 根拠（コード）
- votes への INSERT 経路は実質2系統・計6箇所：
  - クライアント側 `src/app/(main)/vote/[id]/page.tsx`：`submitHopefulVote`(1012)／`handlePhoneVerify`(1261)／`handleFallbackSubmit`(1408)／`handleSubmit`(1593・注釈でデッドコード明記)／`handleClerkVote`(1919-1943)
  - サーバー側（自前OAuth・Clerk非経由）：`src/app/api/vote-auth/line/callback/route.ts:409-438`／`src/app/api/vote-auth/google/callback/route.ts:368-398`
  - QR投票とオンラインPIN投票は同じ関数群を共有（`qr_token` 有無／`vote_pins` 検証で分岐）。「店舗端末」の独立経路は存在しない
- **`votes.client_user_id` は全経路で常に null をINSERT**（実データでも 2,684 件全て null）。カラムはあるが死んでいる
- **`votes.auth_provider_id` の意味が auth_method ごとに別物**で、単一の投票者キーにならない：
  | auth_method | auth_provider_id の中身 |
  |---|---|
  | `line`（自前OAuth） | LINE Login の生 userId（Clerk 非経由） |
  | `google`（自前OAuth） | メール一致で既存 Clerk が見つかった場合のみ Clerk user.id、初回投票者は null |
  | `sms` | 電話番号そのもの |
  | Clerkセッション経由 | Clerk user.id |
- `clients` テーブル（360行・全行 `user_id` あり）への INSERT は `src/app/api/onboarding/route.ts:49-55` のみ。書き込みカラムは `user_id / nickname / last_name / first_name / photo_url`。**LINE 識別子カラムは無い**。投票フローから clients が作られることも無い
- LINE Messaging API の userId の永続先は **`professionals.line_messaging_user_id` のみ**（プロ向けpush用。書き込み元 `src/app/api/line/webhook/route.ts:144`／`line/link/verify/route.ts:64`）。クライアント側に相当カラム無し
- なお `professionals.line_user_id` は実データ全行 null の死にカラム（実際に使われているのは `line_messaging_user_id`、アクティブ296人中95人が保有）

### 根拠（実データ）
- votes 2,684 件（全て status='confirmed'）。voter 識別の実態は **`normalized_email`**（2,667/2,684 件で保有、ユニーク 1,803 人）
- `clients.user_id`（Clerk ID）と `votes.auth_provider_id` の突合が成立しうるのは Clerk セッション投票のみで、実データの `client_user_id` は 0 件

### 今後の選択肢（実装判断は別タスク）
- A) 以後の投票で `votes.client_user_id` を実際に埋める（過去分は救えない、将来分のみ紐付く）
- B) clients 作成時に `normalized_email` / LINE userId 一致で過去投票をバックフィル（Clerk Backend API 併用が必要、SQL単体では不可）

### 未確定（Clerk/LINE の設定確認が必要・CEO 側でのみ確認可能）
- Clerk の LINE ソーシャル連携と自前 LINE OAuth（`LINE_CHANNEL_ID`）が同一 Channel/Provider か
- `professionals.line_messaging_user_id` と LINE Login userId が同一値になる構成か（コードは同一前提で動いている）

---

## §1-2 プルーフ分布

### プルーフ1件の定義（コードで確定）
- `vote_summary` VIEW（`supabase/migrations/009_weighted_votes.sql:6-15`）：`vote_type='proof' AND selected_proof_ids IS NOT NULL AND status='confirmed'`。ただし VIEW の `vote_count` は `session_count='repeat'` を2倍にする**重み付き値**（素の件数ではない）
- `/api/search` の `totalProofs`（`src/app/api/search/route.ts:298-300`）は 1行=1カウント（重み無し）。`selected_proof_ids IS NOT NULL` ガードは無いが、該当する null 行は実データ 0 件のためズレ無し
- カード画面の「総投票数」（`src/lib/card-data.ts:149-151`）は vote_type 無フィルタの全票合算で、プルーフ数とは別物（集計時注意）

### 分布（confirmed proof 2,433 件、重み無し1行1カウント）
| 指標 | 値 |
|---|---|
| プルーフ1件以上のプロ | 160人 |
| プロ別プルーフ数 中位値 | **5件**（p25=2 / p75=13 / p90=35 / 最大327） |
| 度数分布 | 1-2件:47人 / 3-5件:34人 / 6-14件:41人 / 15-29件:20人 / 30件以上:18人 |
| **15件以上到達** | **38人** |
| アクティブプロ総数（deactivated_at null） | 296人 |

※指示書の「定着110人」という母集団は DB から機械的に導出できなかった（アクティブ296人／プルーフ保有160人のいずれとも一致しない）。**「定着」の定義の確認が必要**。38人という到達数は「プルーフ1件以上の160人中」の値。

### ユニーク vs 累計
- ユニーク/累計比（プルーフ3件以上のプロ113人）: **中位値 1.00**（p25=0.77 / p75=1.00）
- → 大半のプロは「投票者ほぼ全員が1回きり」。反復投票は一部のプロに集中

### 常連タグ（コードで確定）
- 実装は**回数ベース**：同一 `normalized_email` × 同一プロへの confirmed 投票の累計（全期間・vote_type 無フィルタ）で、1回=初回／2回=リピーター／**3回以上=常連**（`getVoterLevel()`：`src/lib/card-data.ts:31-35`／`src/app/api/search/route.ts:233-247`、表示 `src/components/VoiceCommentCard.tsx` 相当）
- **「3ヶ月以上継続」という時間軸の定義はコードに存在しない**（指示書 §3-4 の表示文言と不一致 → 要判断）
- レガシー自己申告 `session_count` の残存：`regular` 153件・`repeat` 57件（`Math.max` でレベル底上げに寄与）
- 実データ（正式定義=3回以上）：**常連 152 voter-proペア／常連を1人以上持つプロ34人**（最多49人、次点20人）。リピーター(2回)は190ペア
- 参考：時間軸定義（3票以上かつ初回→最終が90日以上）で数えると24ペア・13人まで絞られる

### 「1人1回」記載と実装の食い違い（§3-5 修正対象の確定）
- 実装は「**同一プロへ7日に1回**」（`src/lib/vote-duplicate-check.ts:56-99`）＋30分全プロ横断クールダウン＋1分ダブルサブミット防止＋プロ単位30分クールダウン（`src/lib/vote-cooldown.ts`）
- LP の誤記載箇所：`src/app/(main)/page.tsx:516`「1人1回。30分に1プルーフまで。」／同 `:534`（比較表「回数制限：1人1回」）
- 投票ページ側は既に正しい文言（`vote/[id]/page.tsx:2055`「1週間に1回」）

---

## §1-3 既存「お気に入り」機能

### スキーマ・件数
- テーブル: **`bookmarks`**。カラムは `id / user_id (TEXT, Clerk userId) / professional_id (UUID) / created_at` の4つ
- **150件・重複ペア(user_id×professional_id)ゼロ・所有者53人**
- 所有者の内訳（user_id の突合）: professionals と clients 両方にレコードあり **119件**／clientsのみ **6件**／どちらにも無し **25件**（退会済み等の可能性、移行時に要ハンドリング）
- 無効化済みプロ・存在しないプロを指す行: **0件**

### 性質
- **片方向ブックマーク**（承認・相互の概念なし）。status系カラム無し
- **通知なし**（LINE/メール/アプリ内いずれも送っていない）
- **非公開**：一覧 `/bookmarks` は本人のみ（`src/app/(main)/bookmarks/page.tsx`）。被ブックマーク数はプロ本人のダッシュボードにのみ表示（`dashboard/page.tsx:2668-2671`、取得 `api/dashboard/route.ts:157`）。第三者には一切見えない
- 追加ボタンは公開カードページのみ（`src/app/(main)/card/[id]/components/CardClient.tsx:410-447`「♡ 気になる」。本人カードでは非表示）。**「この地域で活躍するプロ」（`src/components/RelatedPros.tsx`）にはブックマーク導線が無い**（§3-3 の「連携候補に追加」ボタン新設はここが対象）
- 書き込みは `/api/db`（ClientProxy）経由の汎用 insert/delete。読み取りのみ専用 route（`api/bookmarks/route.ts`・GET専用）

### §3-1 移行への示唆
- 「非公開・片方向・通知なし」という現行性質は、指示書の「連携候補（第1層）」の要件とそのまま一致 → 移行はデータ写像のみで概念変更不要
- 1レコード = 「ログインユーザー（プロ/クライアント両方あり得る）がプロを気になる登録した」件。**連携候補をプロ→プロ限定にするなら、`user_id` が professionals に存在する行だけを移行対象に絞るフィルタが必須**（クライアントの「気になる」を混ぜない）。どちらにも該当しない25件の扱いも要決定
- UNIQUE 制約の有無は information_schema 未確認（実データ上は重複ゼロ）。新テーブル側は指示書通り UNIQUE(list_id, pro_id) を張る

---

## 指示書と現実の矛盾（🛑 STOP 1 判断事項）

1. **`profiles` テーブルは存在しない**（REST 404 確認済み）。指示書の DDL は全て `profiles(id)` 参照 → 実テーブルは `professionals`（プロ）/`clients`（クライアント）。referral_lists.owner_id・referral_list_items.pro_id・§2-2 の accepting系カラム追加先は **professionals** に読み替えが必要
2. **`pro_services` は存在しないが `pro_menus`（38行）が既に実在**：`id / professional_id / name / description / price_text (テキスト) / category_tags / display_order / is_active / created_at / updated_at`。指示書 §2-3 は `price_jpy int`（数値・紹介成立価格）を要求 → 「pro_menus を拡張」か「pro_services を新設」かの判断が必要
3. **常連の定義が二重**：コード実装=回数ベース(3回以上)／指示書 §3-4 表示文言=「3ヶ月以上継続」。3指標表示にどちらを採用するか要決定（実データ: 回数ベース152ペア vs 時間軸24ペア）
4. **アトリビューション遡及は不成立**（§1-1 結論）。リファラルフィー計算の土台は「過去分の再構築」ではなく「Phase 1 以降の新規記録」で持つ設計に倒す必要がある
5. **「定着110人」の定義が DB から導出不能**（アクティブ296人・プルーフ保有160人）。定義の提示が必要
6. **§2-5 の org_members CREATE TABLE は既存テーブルと衝突**（既存 org_members は invited_at/accepted_at/removed_at/credential_level_id 構成で稼働中・Organization機能の本体）。Phase 3 着手前に指示書側の改訂が必須（Phase 1 スコープ外だが早期に指摘）
7. 指示書 §0-1「Preview branch で検証→main へ merge」は、CLAUDE.md・起動プロンプトの「main 直接コミット＋機能フラグ」運用が優先（起動プロンプトで明示済み）

---

## Phase 0 残作業（調査以外のコード3点・未着手）

- [ ] §3-5 LP文言修正：`src/app/(main)/page.tsx:516, 534`「1人1回」→「1人毎週1回」
- [ ] §3-5 投票完了画面に「あなたも証明を持てる」→プロ登録導線を1行追加
- [ ] §2-7 投票画面にリワード開示の一行追加

STOP 1 承認後、Phase 1 実装と並行せず先に個別コミットで実施予定。
