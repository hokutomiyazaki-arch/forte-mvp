-- 061_qr_tokens_booking_id.sql
-- クライアントへの記録依頼(§16-41・CEO決定 2026-08-08)
--
-- 目的:
--   プロが完了済み(または確定済み・日時過去)の予約から、任意のタイミングで
--   「記録をお願いする」トークン付きメールをクライアントへ送る(実装は
--   src/app/api/referral/bookings/received/route.ts の action='request_proof')。
--   このトークンは既存の qr_tokens テーブルを共用する(vote/[id]ページのtoken検証を
--   一切変更しないため)。
--
--   qr_tokens には既に「ダッシュボードQR再発行」が同じ professional_id の行を
--   全削除→再INSERTする処理がある(generateQR)。列を区別しないと、予約依頼で送った
--   未使用トークンをダッシュボードQRの再発行が誤って消してしまう。
--   そこで booking_id 列を追加し、削除対象を「booking_id が null の行だけ」に
--   限定できるようにする(src/app/(main)/dashboard/page.tsx generateQR側で対応)。
--
-- DEFAULT を付けない理由: 神山事件と同じ(想定外INSERTへの旧値混入を防ぐ)。
-- 既存行(ダッシュボードQR・投票QR等)は booking_id が NULL のままで良い(=対象外の意味)。

ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS booking_id uuid;

COMMENT ON COLUMN qr_tokens.booking_id IS
  'クライアントへの記録依頼で発行したトークンの場合のみ、対象のreferral_bookings.idが入る。NULL=通常のQR(ダッシュボード/投票)。';

CREATE INDEX IF NOT EXISTS idx_qr_tokens_booking ON qr_tokens(booking_id) WHERE booking_id IS NOT NULL;

-- 検証
-- SELECT column_name, column_default FROM information_schema.columns
--  WHERE table_name='qr_tokens' AND column_name='booking_id';
--   -- 1行・column_default は NULL であること
-- SELECT count(*) FROM qr_tokens WHERE booking_id IS NOT NULL; -- 0(実行直後)
