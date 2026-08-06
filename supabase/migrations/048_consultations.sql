-- ============================================================
-- Migration 048: 相談フォーム（§16-19）のテーブル
-- ============================================================
--
-- ⚠️ このファイルは「後追いの記録」です。
-- 048 の DDL は 2026-08-05 に CEO 承認のうえ Supabase SQL Editor で**実行済み**ですが、
-- migration ファイルが残っていませんでした（supabase/migrations は 047 で止まっていた）。
--
-- 2026-08-06: CEO が information_schema.columns を流して**実物と突き合わせ済み**。
-- 当初 session-log から再構成した内容とは2点ズレていたので、実物に合わせて修正した:
--   - client_name は NOT NULL（再構成では NULL 可としていた）
--   - status の既定は 'new'（再構成では 'open' としていた）
-- 全て IF NOT EXISTS で冪等（そのまま流しても既存テーブルは壊さない）。
-- ※ CHECK 制約の有無までは未確認。status / sender に取りうる値を増やす時は
--   information_schema.check_constraints で先に確認すること。
--
-- 設計の要点（session-log より）
--   ① 往復するため本文は別テーブル（consultation_messages）
--   ② access_token が必須。Resend は送信専用でメール返信を受け取れないため、
--      送信メール内の「返信する」リンクからフォームに戻す導線に使う
--   ③ client_email は保存するが **API レスポンスには含めない**。
--      プロのダッシュボードでのみ表示する（CLAUDE.md D: PII を返さない）
--   ④ referral_bookings は日時必須＋決済/送金の状態機械を持つため流用しない
-- ============================================================

-- ── 実物の確認（2026-08-06 実施済み・再確認する時はこれを流す）──────
-- SELECT table_name, column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name IN ('consultations', 'consultation_messages')
-- ORDER BY table_name, ordinal_position;

-- ── 相談スレッド ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consultations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id        uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  -- 既存のゲストクライアント（createGuestClient）と紐づける。匿名相談もあり得るので NULL 可。
  client_id     uuid REFERENCES clients(id) ON DELETE SET NULL,
  client_name   text NOT NULL,
  -- PII。APIレスポンスに含めない。
  client_email  text NOT NULL,
  -- 実物の既定は 'new'
  status        text NOT NULL DEFAULT 'new',
  -- メールの「返信する」リンクからフォームに戻すための鍵。推測不能な値を入れる。
  access_token  text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 相談の本文（1スレッドに複数・往復）──────────────────────
CREATE TABLE IF NOT EXISTS consultation_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  -- 'client' か 'pro'
  sender          text NOT NULL,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- メール送信が成功した時刻。未送信/送信失敗は NULL のまま。
  delivered_at    timestamptz
);

-- ── index 3本 ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_consultations_pro_id
  ON consultations (pro_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultations_access_token
  ON consultations (access_token);
CREATE INDEX IF NOT EXISTS idx_consultation_messages_consultation_id
  ON consultation_messages (consultation_id, created_at);
