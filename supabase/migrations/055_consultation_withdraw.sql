-- 055_consultation_withdraw.sql
-- 送信の取り消し（§16-36 改訂・CEO決定 2026-08-06）
--
-- 決定内容:
--   「相手の画面からも消えるけど、システムには残る」
--   目的は「相手に送ったものを引っ込める」ことであって、誰かを捕まえることではない。
--   ヤバいものを自分で取り消してくれるなら、運営が間に入る手間が減る。
--   ただし、いざというとき（通報・トラブル）に確認できるよう行そのものは残す。
--
-- そのため物理削除ではなく withdrawn_at を立てる論理削除にする。
-- API 側は withdrawn_at IS NOT NULL を**両方の画面**（クライアント／プロ）から除外する。
--
-- 実行前後の確認:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'consultation_messages' ORDER BY ordinal_position;

ALTER TABLE consultation_messages
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;

COMMENT ON COLUMN consultation_messages.withdrawn_at IS
  '送信取り消し日時。どちらの画面にも出さないが行は残す（通報時に運営が確認できるようにするため）。null=通常のメッセージ。';
