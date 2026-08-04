-- 040: 送り手の報酬受け取り用 Stripe Connect アカウント紐付け
-- 実行者: CEO（Supabase SQL Editor で手動実行）。CC は実行しない。
--
-- 背景: ステージ4「Stripe Connect 口座登録導線」(CEO承認済み・2026-08-04)。
--   送り手プロが Stripe Express onboarding で自分の受け取り口座を登録できるようにするため、
--   professionals に Connect アカウントIDと状態キャッシュを持たせる。
--   自動送金は次フェーズ（このmigrationは口座登録・状態表示までの対象）。
--
-- stripe_connect_account_id: Stripe Connect(Express)のアカウントID(acct_...)。PIIではないが
--   Stripe側の識別子のためUIには出さない(口座番号等の実データはStripeが保持しREAL PROOFのDBには
--   一切保存しない)。
-- stripe_connect_payouts_enabled: Stripeの `payouts_enabled` の表示用キャッシュ(boolean)。
--   毎回Stripe APIを叩かずに状態表示するための非正本データ。正本は常にStripe側。
--
-- 安全性: 既存テーブル(professionals)への列追加のみ。新規カラムにDEFAULTは付けない方針
--   (想定外INSERTへの値混入を防ぐ・rp-reference §1絶対ルール)。指示書は
--   stripe_connect_payouts_enabled に DEFAULT false を提案していたが、上記の絶対ルールを
--   優先してDEFAULT無しに変更した(既存行・新規行ともNULL始まり)。コード側は
--   NULL/false のいずれも「未有効」として扱うため(=truthy判定のみ・COALESCE的に扱う)、
--   DEFAULT無しでも表示・判定は変わらない。

-- 巻き戻し(神山事件プロトコル準拠の注意書き): DROP COLUMN する場合は
--   ① 事前に `column_default` が付いていないことを確認(本migrationではDEFAULT未設定のため
--      本来は不要だが、運用中に誰かがALTERで追加していないか必ず確認する)
--   ② `SELECT count(*) FROM professionals WHERE stripe_connect_account_id IS NOT NULL;` で
--      残存件数を確認(=登録済みの送り手が何人いるかの把握。DROPすると口座紐付けを失うため
--      実質的に取り返しがつかない)
--   ③ 上記件数をCEOに報告してから `ALTER TABLE professionals DROP COLUMN stripe_connect_account_id;`
--      / `DROP COLUMN stripe_connect_payouts_enabled;` を実行
--
-- 次フェーズへの申し送り(軽微12): account.updated webhookを実装する際は、Stripeの
--   account.id からprofessionalsを逆引きする経路になるため、その時点で
--   stripe_connect_account_id に UNIQUE INDEX を追加すること(現時点では逆引き経路が無いため
--   本migrationでは追加しない)。

ALTER TABLE professionals ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled boolean;

-- 検証
-- SELECT column_name, column_default FROM information_schema.columns
--   WHERE table_name = 'professionals' AND column_name IN ('stripe_connect_account_id', 'stripe_connect_payouts_enabled');
-- SELECT count(*) FROM professionals WHERE stripe_connect_account_id IS NOT NULL;  -- 0(実行直後)
