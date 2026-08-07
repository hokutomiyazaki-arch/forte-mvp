-- 058_consultation_email_failed.sql
-- 相談チャットでも「メールが届いていない」を出す（§17-8・CEO指示 2026-08-06）
--
-- CEOの指示:
--   「同じ仕組みは相談チャットにも入ってる？ 相談チャットの場合は、クライアントが
--     返信手段がないとなにも無いので、それをチャット内に表示して
--     ワンクリックでチャットを消去できるようにして。」
--
-- なぜ相談のほうが重いか:
--   予約には電話番号がある（§17-3④はそこへ逃がす）。相談は**メールしか預かっていない**。
--   届かない＝クライアントはやりとり画面に戻る手段が一切ない＝そのスレッドは死んでいる。
--   プロが返信を書き続けても永久に届かないので、その事実を出して畳めるようにする。
--
-- ADD COLUMN のみ（DEFAULT なし・既存行は NULL）。未実行でも相談機能は動く
-- （webhook 側・API 側とも fail-soft。ただし実行するまで「届いていない」表示は出ない）。

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS email_failed_at timestamptz;

COMMENT ON COLUMN consultations.email_failed_at IS
  'このお客さまのメールがバウンスした日時（Resend webhook が記録）。null=正常。'
  ' 立っている間はクライアントがやりとりに戻る手段が無い＝返信しても届かない。';

-- 検証
-- SELECT column_name, column_default FROM information_schema.columns
--  WHERE table_name = 'consultations' AND column_name = 'email_failed_at';
--   -- 1行・column_default は NULL であること
