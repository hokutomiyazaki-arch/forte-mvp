-- ============================================================
-- Migration 051: プロが「相談を受け付けない」を選べるようにする
-- ============================================================
--
-- CEO指示（2026-08-06）:「プロがクライアントからの相談、受け付けないも設定できるようにして。
-- 相談タブの一番上にスイッチを設置」
--
-- 既存の accepting_status とは別軸にする。
--   accepting_status = 'closed'      … 紹介も直接も全部停止（相談も止まる）
--   accepting_status = 'conditional' … 紹介予約だけ停止・直接の相談は継続（§16-18）
--   consultation_enabled = false     … **相談だけ**止める（予約は受け続ける）
-- 「予約は受けたいが相談のやりとりはしたくない」を表現する手段が今まで無かった。
--
-- 既定は true（全員が今までどおり相談を受け取る）。NOT NULL + DEFAULT なので
-- 既存行にも true が入る。
--
-- ⚠️ コード側は**このカラムが無くても動く**（fail-soft）。
--    未作成なら SELECT が null を返し、null は「受け付ける」として扱う。
--    ただしスイッチの保存（UPDATE）はカラムが無いと失敗するので、
--    スイッチを使うにはこの migration の実行が必要。
-- ============================================================

ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS consultation_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN professionals.consultation_enabled IS
  'カードの「相談する」を受け付けるか。false で相談フォームを閉じる（予約とは別軸・§16-25）。';

-- ── 検証 ────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'professionals' AND column_name = 'consultation_enabled';
--
-- SELECT consultation_enabled, COUNT(*)
-- FROM professionals
-- GROUP BY consultation_enabled;
