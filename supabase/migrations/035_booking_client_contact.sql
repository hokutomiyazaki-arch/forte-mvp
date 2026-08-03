-- 035: 紹介予約のクライアント連絡先カラム追加（§2-4ステージ1・アカウントレス化）
-- 実行者: CEO（Supabase SQL Editor で手動実行）。CC は実行しない。
-- 背景: 相談の会員登録を撤廃し、名前＋電話番号＋メールアドレスを必須収集する（CEO決定 2026-08-03）。
--   clients テーブルには email/phone カラムが無く、開示制御（受け手には確定まで非開示）を
--   予約単位で行うため、referral_bookings に予約ごとの連絡先として持たせる。
-- 安全性: ADD COLUMN のみ（既存行は NULL・破壊的変更なし・DEFAULT なし）。
-- ⚠️ PII: これらのカラムを API レスポンスに含めてよいのは
--   「受け手プロ向け・status='confirmed' 以降」のみ（実装側で遮断する）。

ALTER TABLE referral_bookings
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_phone text,
  ADD COLUMN IF NOT EXISTS client_email text;

-- 検証
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'referral_bookings' AND column_name LIKE 'client_%';
