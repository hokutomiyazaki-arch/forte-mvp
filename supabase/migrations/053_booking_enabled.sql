-- ============================================================
-- Migration 053: 予約受付と紹介予約受付を別の軸にする
-- ============================================================
--
-- CEO決定（2026-08-06）:「直接予約システムも一緒に作ることにしたから、
-- ホーム画面の予約トグルは予約受付イエスかノーかであるべき」
--
-- 【変更前】accepting_status 1本で3状態しか表せなかった
--   open        = 紹介も直接も受付
--   conditional = 紹介のみ停止・直接は継続
--   closed      = 両方停止
--   → **「直接は止めるが紹介は受ける」が表現できない**
--
-- 【変更後】2本の独立した軸にする
--   booking_enabled  = 直接予約の受付   ← ホームのトグル
--   accepting_status = 紹介予約の受付   ← 紹介タブのスイッチ（open/closed の2値運用）
--   （相談は consultation_enabled・migration 051。合計3軸）
--
-- これで4通り全部が表せる。「紹介だけ受け付ける」も作れる。
--
-- 既定は true（全員が今までどおり予約を受ける）。
--
-- ⚠️ コード側はカラムが無くても動く（null は「受け付ける」として扱う）。
--    ただしトグルの保存はカラムが無いと失敗する。
-- ============================================================

ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS booking_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN professionals.booking_enabled IS
  '直接予約の受付。false でカードの予約ボタンを出さない（代替リストがあればそちらを案内する）。紹介予約は accepting_status が別軸で持つ（§16-29）。';

-- ── 検証 ────────────────────────────────────────────
-- SELECT booking_enabled, COUNT(*) FROM professionals GROUP BY booking_enabled;
