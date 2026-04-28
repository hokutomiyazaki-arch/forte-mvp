# REALPROOF 開発ルール

## 🚨 絶対ルール（最優先）
- **ブランチを作らない。常にmainに直接コミット・push。**
- worktreeも作らない。
- `git checkout -b` は使わない。

## 鉄則
- getUser()は使わない。常にgetSession()
- .single()は使わない。常に.maybeSingle()
- 1修正=1コミット。修正後 npm run build 確認
- 「まずコードを見せて、変更はまだしないで」が安全
- 新規ファイル作成時は `git status` で Untracked がないこと確認
- 「ついでに直す」誘惑は別タスクに分離。スコープを膨らませない

## 認証の注意
- signUpとsignInは別コードパス
- login/page.tsx は地雷原。変更時は全フロー確認
- router.push()ではなくwindow.location.hrefを使う
- 認証や非同期処理の前に `const snapshot = buildXxx()` で全 state を固定（stale state対策）
- DB INSERT は最終確認後に1回だけ。「pending → 後で更新」パターン禁止

# ============================================================
# 🛑 頻発バグ防止チェックリスト
# ============================================================

> 該当領域を触る前に該当カテゴリを確認すること。
> 詳細・コード例・過去インシデントは `LESSONS.md` 参照。

## A. キャッシュ・SSR（Vercel）

- [ ] 新規 API route には `export const dynamic = 'force-dynamic'`
- [ ] Supabase createClient で `cache: 'no-store'` を fetch wrapper に設定
- [ ] 「データが反映されない」→ **Step 0 はハードリフレッシュ**（Cmd+Shift+R）
- [ ] OGP画像/バッジは `?v=N` でキャッシュバスト（特にLINEは強烈にキャッシュ）
- [ ] Vercel Function Region は `hnd1`（東京）。米国だと +3秒
- [ ] 「表示されない」調査順序: **キャッシュ排除 → API直叩き → DB → コード**

## B. State管理（React）

- [ ] `useEffect` 依存配列に **オブジェクト/配列を入れない**（無限ループ）
- [ ] 認証/非同期の前に `const snap = buildVoteData()` で snapshot
- [ ] 投票・送信処理は snapshot のみ使用、useState を再読み取りしない
- [ ] **配列を破壊的に触らない**（`votes.sort()` ではなく `[...votes].sort()`）
  - ※ `dashboard/page.tsx:3124` に既知の潜在バグあり、別途修正予定
- [ ] 同一目的のデータ組み立ては必ず共通関数に集約。コピペは必ずズレる
- [ ] `onAuthStateChange` と `useEffect` を併用しない（競合してフリーズ）

## C. DB・Supabase スキーマ落とし穴

- [ ] **存在しないカラムを SELECT しても null が返る**（エラーにならない）
- [ ] よくある誤推測:
      `display_name` ❌ → `name` ✅／
      `email` ❌ → `contact_email` ✅／
      `clerk_user_id` ❌ → `user_id` (TEXT) ✅／
      `selected_proofs` ❌ → `selected_proof_ids` (TEXT[]) ✅／
      `voted_at` ❌ → `created_at` ✅
- [ ] **存在しないテーブル**: `professional_badges` / `org_badge_levels` は実在しない
- [ ] **VIEW（INSERT/UPDATE 不可）**: `vote_summary` / `active_ranking` / `personality_summary`
- [ ] `org_members` JOIN は **必ず DISTINCT**（1プロ×1バッジで複数行、文末教訓も参照）
- [ ] 検索・重複チェックは `normalized_email`、`voter_email` は表示用
- [ ] `professionals` 全クエリに `.is('deactivated_at', null)`（自分自身/ID指定/管理画面除く）
- [ ] FK制約が消えると `.select('table(...)')` の JOIN がサイレントに空を返す
- [ ] timestamp カラムに文字列を入れない（`'expired'` ❌ → `new Date().toISOString()` ✅）
- [ ] カラム名確認は `information_schema.columns` で実態を見る

## D. 外部連携（LINE / Email / mailto）

- [ ] **LINE 内蔵ブラウザは callback が2回発火**する → 冪等性／中断状態リカバリを意識
- [ ] LINE 初回送信は reply、**2回目以降は push**（`line_user_id` 永続化必須）
- [ ] mailto: 各パラメータを **個別に `encodeURIComponent()` + `&` で連結**
- [ ] mailto は **PC では動かないことがある** → スマホで確認（QR導線が前提）
- [ ] **Resend は送信専用**。返信が必要なら `reply-to` 設定 or 「返信不可」明記
- [ ] メール認証は **リンククリック方式 NG → 6桁コード入力方式**（モバイル+キャリアメール対応）
- [ ] API レスポンスに `voter_email` / `normalized_email` / `voter_phone` を**絶対含めない**

## E. DB破壊的操作（5段階安全プロトコル）

DELETE / UPDATE（広範囲）/ DROP COLUMN は**必ず**:

1. **調査** — 対象を SELECT、件数・内容・影響範囲を把握
2. **バックアップ** — SELECT INTO 別テーブル または CSV
3. **プレビュー** — 同じ WHERE で SELECT、影響行を全表示
4. **明示承認** — CEO に件数報告 → GO 待ち
5. **実行+検証** — RETURNING 付き、件数を検証

加えて:

- [ ] **Supabase SQL Editor で BEGIN/COMMIT を分けない**（セッション境界でROLLBACKされる）
- [ ] WHERE 句で**二重安全装置**（例: `AND contact_email IS NULL`）
- [ ] **PITR 未契約**（5秒粒度の復元不可）、daily backup は前日深夜のみ
- [ ] 「一括クリーンアップ」のような包括提案は**絶対禁止**。範囲を明示
- [ ] 1件のサンプルで全体を結論づけない。より広い母集団のSQLで再確認

## F. 投票パス・バリデーション（追加・修正時）

新しい投票パスは **クライアント5 + サーバー3 = 計8パス**全てに同じ検証を適用。
INSERT 前に必ず:

- [ ] QRトークン検証（**`used_at IS NULL`** + `expires_at > NOW()`、Set 1）
- [ ] セルフ投票チェック（`user_id` ベース）
- [ ] voter単位30分クールダウン（**`normalized_email`**で、professional_id で絞らない）
- [ ] プロ単位30分クールダウン（同一プロへの連続投票ブロック、Set 2）
- [ ] 重複投票チェック（normalized_email + professional_id の UNIQUE）
- [ ] 1日3プロ制限
- [ ] INSERT 後に `markTokenUsed*` を呼んで `used_at` 記録（Set 1 出口）

指示書に「Nパス」と書いても **grep で実装網羅性を確認**せよ（過去にパス漏れあり）。

## G. デッドコード・コード一貫性

- [ ] 「デッドコードかも」の推測で放置すると後でハマる
- [ ] 判定基準は**3点証拠**: ① grep結果 ② UI導線（router.push/redirect）③ コミット履歴
- [ ] 「ほとんど同じだけど少し違う」実装は diff時点で共通化

## H. 新しい error code を追加する時の3点セット

callback / API で `?error=xxx` を返すなら**必ず3つ揃える**:

1. callback / API 側の error 出力
2. フロント側の error mapping（`vote-error-messages.ts`）
3. 表示文言定義 + 受け取り側ハンドラ

1つでも抜けるとサイレントに「不明エラー」or「auth_invalid」に落ちる。

## I. 触ってはいけない既存実装（明示保護リスト）

- 検索ハイライト機能（`?highlight=...`）
- リピーター/常連マーク表示
- ハッシュチェーン関連
- 既存の認証フロー
- 既存の RewardReveal / RewardContent

新機能の指示書には**最初にこのリスト**を書く。

# ============================================================
# Organization Feature (団体機能)
# ============================================================

## Organization Feature — 4つの絶対原則

1. **プルーフの所有権は常に「個人」にある。** 団体はビューレイヤー（閲覧層）のみ。プルーフデータの所有・管理・削除の権限は持たない。
2. **団体独自のプルーフは存在しない。** 個人プルーフの集約が団体のプルーフ。団体レベルのプルーフカテゴリを追加した瞬間、「手間のかかるGoogle口コミ」になる。
3. **団体QRは存在しない。** プロのQRが唯一の投票入口。団体QRは「誰が見せるのか」のdesign smell。
4. **REALPROOFはバッジを作らない。** バッジを発行・表示・証明するインフラを提供する。Shopifyモデル。

## Organization Feature — 変更禁止リスト

以下のテーブル・機能はOrganization実装時に一切変更しない:

- `professionals` テーブル（store_idカラム追加しない）
- `votes` テーブル（投票は常にプロ個人への行為）
- `rewards` / `client_rewards` テーブル
- `qr_tokens` テーブル（団体QRは作らない）
- `vote_summary` ビュー
- 投票フロー（/vote/[token]）

## Organization Feature — 新テーブル

- `organizations`: 団体テーブル（type: store/credential/education）
- `org_members`: 団体×プロの所属関係（status: pending/active/removed）
- `org_invitations`: メール招待管理
- `credential_levels`: バッジ定義（Phase 1Bで追加。Phase 1Aでは作らない）

## Organization Feature — ロール

- `owner`: 団体オーナー。usersテーブルのroleに追加
- オーナーが同時にプロの場合: org_membersで is_owner=true として自分も追加

## Organization Feature — RLS原則

- オーナーは自分の団体のorg_members/org_invitationsを管理可能
- プロは自分の所属情報を閲覧可能
- プロは「店舗」からのみ自分で離脱可能（資格バッジは団体のみが管理）
- オーナーは個別コメント・リワード設定・QRコードを閲覧不可

## Organization Feature — フェーズ分割

- **Phase 1A**: 店舗オーナーのコア機能（団体登録、メンバー招待、ダッシュボード、公開ページ）
- **Phase 1B**: Badge Self-Service（credential_levels、claim URL、バッジ管理ダッシュボード）
- **Phase 2**: Analytics + Search + 有料プラン

## 教訓: org_members重複削除事故 (2026-03-13)

org_membersは1プロ=複数行（バッジごとに1行）の設計。
重複削除で DISTINCT ON (organization_id, professional_id) を使うと、
正当なバッジ行（advance/master/TBU）まで消す。

重複削除が必要な場合は必ず：
DISTINCT ON (organization_id, professional_id, credential_level_id)
の3カラムで行うこと。

2026-03-13にadvance/master/TBUデータ消失→手動INSERT復旧。

# ============================================================
# 詳細リファレンス
# ============================================================

このファイルのチェックリスト各項目の **背景・コード例・過去インシデント詳細** は
`LESSONS.md` を参照。新しい教訓を得たら LESSONS.md に追記し、
このファイルにはチェック1行だけ反映する運用。
