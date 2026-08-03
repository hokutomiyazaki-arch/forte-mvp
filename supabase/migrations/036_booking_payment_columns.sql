-- 036: 紹介予約の決済トラッキングカラム追加（§2-4ステージ2・相談時オーソリ）
-- 実行者: CEO（Supabase SQL Editor で手動実行）。CC は実行しない。
-- 背景: 相談送信時に Stripe Checkout（manual capture=オーソリのみ）を挟む。
--   セッションIDと決済状態を予約行で追跡する（stripe_payment_intent_id は032で作成済み）。
-- 安全性: ADD COLUMN のみ（既存行はNULL・破壊的変更なし）。
--   コード側は REFERRAL_STRIPE_SECRET_KEY 未設定の間はこれらのカラムに触れない
--   （フラグゲート済み）ため、実行順はデプロイ前後どちらでも壊れないが、
--   キー投入（=決済フロー有効化）の前には必ず実行しておくこと。

-- PART A: 決済トラッキングカラム
ALTER TABLE referral_bookings
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS payment_status text; -- 'unpaid'|'authorized'|'captured'|'canceled'|'not_required'（CHECKは付けず運用で管理）

-- PART B: status に 'draft' を追加（レビュー指摘: 決済経路の予約はオーソリ完了まで draft で保持し、
--   受け手一覧・通知・48h失効・重複チェックの対象外にする。オーソリ完了で 'requested' へ昇格）
-- B-1【プレビュー】制約名の確認（通常は referral_bookings_status_check）
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'referral_bookings'::regclass AND contype = 'c';
-- B-2【実行】（B-1で確認した制約名に合わせること）
ALTER TABLE referral_bookings DROP CONSTRAINT referral_bookings_status_check;
ALTER TABLE referral_bookings ADD CONSTRAINT referral_bookings_status_check
  CHECK (status IN ('draft','requested','confirmed','completed','cancelled','expired'));

-- 検証
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'referral_bookings' AND column_name IN ('stripe_checkout_session_id','payment_status','stripe_payment_intent_id');
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'referral_bookings_status_check';

-- ⚠️ 運用手順（この順を厳守）: ①この036を全部実行 → ②コードのデプロイ → ③REFERRAL_STRIPE_SECRET_KEY をVercelに投入
--   （キーを先に入れると、draft INSERT が CHECK 制約違反・payment_status が 42703 で失敗する）
