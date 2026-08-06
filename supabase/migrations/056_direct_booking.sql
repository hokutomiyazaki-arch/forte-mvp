-- 056_direct_booking.sql
-- REALPROOF ネイティブの直接予約（§17-1・CEO決定 2026-08-06）
--
-- 決定内容:
--   「予約システム構築いこうか。既存の仕組みに、予約金なしにすればok。
--    自分のサイトを予約ボタンに設定している人はどちらかを選ばせる。
--    現在作ってあるメニューとも統合して。メニューからも予約ボタンを押せるように。」
--
-- 方針: 新しい予約テーブルは作らない。紹介予約(referral_bookings)の仕組みをそのまま使い、
--   ①紹介元(list_id / sender_pro_id)が無い ②予約金(Stripe)を挟まない、の2点だけを変える。
--   受け手側のダッシュボード・確定/辞退/日時変更/完了・失効cronは既存のものがそのまま効く。
--
-- 追加は2カラムのみ（いずれも ADD COLUMN・DEFAULT なし・既存行は NULL）。
--   DEFAULT を付けない理由: 神山事件（column_default が残ると、コードから参照ゼロでも
--   新規INSERTが旧値を運ぶ）。source は書き手が必ず明示する。

-- 1) プロが予約をどこで受けるか
--    'rp'       = REALPROOF で受ける（この直接予約システム）
--    'external' = 自分のサイト/外部予約システム（professionals.booking_url へ送る）
--    NULL       = 未選択。booking_url があれば external 相当、無ければ rp 相当として扱う
--                 （既存プロの挙動を変えないための解釈。コード側 src/lib/booking-mode.ts が単一情報源）
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS booking_mode text;

COMMENT ON COLUMN professionals.booking_mode IS
  '予約の受け方。rp=REALPROOFで受ける / external=自分のサイトで受ける / NULL=未選択(booking_urlの有無で解釈)。';

-- 2) その予約がどこから来たか
--    'direct'   = 公開カード・メニュー・相談チャットからの直接予約（紹介元なし・予約金なし）
--    NULL       = 従来の紹介予約（既存行はすべてこれ。'referral' で埋め直す必要はない）
ALTER TABLE referral_bookings
  ADD COLUMN IF NOT EXISTS source text;

COMMENT ON COLUMN referral_bookings.source IS
  '予約の発生元。direct=REALPROOFの直接予約(紹介元なし・予約金なし) / NULL=従来の紹介予約。';

-- 検証
-- SELECT column_name, column_default FROM information_schema.columns
--  WHERE (table_name='professionals' AND column_name='booking_mode')
--     OR (table_name='referral_bookings' AND column_name='source');
--   -- 2行・column_default は両方 NULL であること
-- SELECT count(*) FROM referral_bookings WHERE source IS NOT NULL;  -- 0（実行直後）
