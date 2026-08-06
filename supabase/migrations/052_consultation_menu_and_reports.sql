-- ============================================================
-- Migration 052: 相談チャットの4点強化（§16-27）
-- ============================================================
--
-- CEO指示（2026-08-06）。**シティヘブンの事前チャットから学んだ型**。
-- 「会う前の不安を下げ、予約に接続する」構造をそのまま持ってくる。
--
-- このマイグレーションが要るのは4点のうち2つ:
--   ③ 相談→予約の接続 … メッセージが「メニューの提案」であることを持つ必要がある
--   ④ 通報            … 通報を記録するテーブルが要る
-- ①返信期待値の文言 と ②連投制限 は表示とロジックだけなのでDDL不要。
--
-- ⚠️ コード側は**このマイグレーションが無くても動く**（fail-soft）。
--    menu_id 付きの INSERT が失敗したらキーを外して再試行するので、
--    提案は「ただのテキストメッセージ」として入る（カードにはならない）。
--    通報は未作成だと保存に失敗し、UIにエラーが出る。
-- ============================================================

-- ── ③ メニュー提案 ────────────────────────────────────
-- 提案メッセージは body（人が読む文）＋ menu_id（カード描画用）の2本立てにする。
-- body を必ず入れるのは、カラムが無い環境やメニューが後から削除された場合でも
-- 会話として意味が通るようにするため。
ALTER TABLE consultation_messages
  ADD COLUMN IF NOT EXISTS menu_id uuid REFERENCES pro_menus(id) ON DELETE SET NULL;

COMMENT ON COLUMN consultation_messages.menu_id IS
  'プロが提案したメニュー。null なら通常のメッセージ。相談→予約の接続に使う（§16-27-3）。';

-- ── ④ 通報 ──────────────────────────────────────────
-- 「通常、運営はチャットを閲覧しません。通報があった場合のみ確認します」を成立させるための記録。
-- 通報者は client / pro のどちらもありうる。
CREATE TABLE IF NOT EXISTS consultation_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  -- 'client' か 'pro'
  reporter        text NOT NULL,
  reason          text,
  -- 運営が確認した日時。null = 未対応。
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_reports_consultation_id
  ON consultation_reports (consultation_id);
-- 未対応のものを拾うため
CREATE INDEX IF NOT EXISTS idx_consultation_reports_unreviewed
  ON consultation_reports (created_at DESC) WHERE reviewed_at IS NULL;

-- ── 検証 ────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'consultation_messages' AND column_name = 'menu_id';
--
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'consultation_reports' ORDER BY ordinal_position;
