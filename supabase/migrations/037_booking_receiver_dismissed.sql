-- 037: 受け手がキャンセル通知カードを閉じた記録（§2-4・CEO指示 2026-08-04）
-- 実行者: CEO委任によりCCがSQL Editorで実行。
-- 背景: 支払い期限切れ等でキャンセルされた紹介予約を受け手のカードに表示し、
--   「閉じる」ボタンで非表示にする。行の物理削除はしない（決済・監査記録のため）。
-- 安全性: ADD COLUMN のみ（既存行はNULL・破壊的変更なし）。

ALTER TABLE referral_bookings
  ADD COLUMN IF NOT EXISTS receiver_dismissed_at timestamptz;

-- 検証
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'referral_bookings' AND column_name = 'receiver_dismissed_at';
