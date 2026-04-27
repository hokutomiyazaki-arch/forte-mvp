-- 026_popup_mechanism.sql
--
-- Voices シェア促進ポップアップ機構（v1.2 §12）
--
-- 目的:
--   ダッシュボード読み込み時に、過去 Voice をランダム抽選してシェアを促進する
--   ポップアップを表示するための DB スキーマ。
--
--   - professionals.popup_first_shown_at / popup_last_shown_at:
--       表示タイミング判定（初回 + 5件閾値）に使用
--   - popup_history:
--       同じ Voice を連続提示しないため + 達成記念の重複防止用に
--       表示履歴を記録
--
-- 変更内容:
--   1. professionals に popup_first_shown_at / popup_last_shown_at を追加
--   2. popup_history テーブル新規作成（vote_id を vote の FK で参照）
--   3. 抽選プール検索 / 履歴存在判定 / 達成記念存在判定の 3 INDEX
--   4. RLS 既存方針に合わせて DISABLE
--
-- 適用方法:
--   Supabase SQL Editor で宮崎さんが手動実行（Phase D 内）。
--   IF NOT EXISTS / CHECK 制約は冪等性のため、複数回実行しても安全。
--
-- ロールバック:
--   DROP TABLE IF EXISTS popup_history CASCADE;
--   ALTER TABLE professionals DROP COLUMN IF EXISTS popup_first_shown_at;
--   ALTER TABLE professionals DROP COLUMN IF EXISTS popup_last_shown_at;
-- =============================================================================

-- 1. professionals テーブルにポップアップ状態カラムを追加
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS popup_first_shown_at TIMESTAMPTZ;

ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS popup_last_shown_at TIMESTAMPTZ;

COMMENT ON COLUMN professionals.popup_first_shown_at IS
  'シェア促進ポップアップを初めて表示した時刻（NULL = 未表示）。初回判定に使用。';
COMMENT ON COLUMN professionals.popup_last_shown_at IS
  '最後にポップアップを表示した時刻（タイプ問わず）。5件閾値の起点に使用。';


-- 2. popup_history テーブルの新規作成
CREATE TABLE IF NOT EXISTS popup_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  vote_id UUID NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
  popup_type TEXT NOT NULL CHECK (popup_type IN ('random', 'milestone', 'first')),
  shown_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_action TEXT CHECK (user_action IS NULL OR user_action IN ('shared', 'edited', 'dismissed')),
  badge_event TEXT  -- milestone の場合のみ: 'PROVEN' / 'SPECIALIST' / 'MASTER'
);

COMMENT ON TABLE popup_history IS
  'シェア促進ポップアップの表示履歴。同じVoiceを連続提示しない用途 + 達成記念の重複防止用。';


-- 3. INDEX
-- 3-1. 抽選プールから popup_history 既出を除外する用途
CREATE INDEX IF NOT EXISTS idx_popup_history_pro_voice
  ON popup_history (professional_id, vote_id);

-- 3-2. 直近の表示履歴を professional_id ごとに参照する用途
CREATE INDEX IF NOT EXISTS idx_popup_history_pro_shown
  ON popup_history (professional_id, shown_at DESC);

-- 3-3. 達成記念の重複表示防止（バッジごとに 1 回だけ）
CREATE INDEX IF NOT EXISTS idx_popup_history_milestone
  ON popup_history (professional_id, popup_type, badge_event)
  WHERE popup_type = 'milestone';


-- 4. RLS 設定（既存方針に従い無効化、service_role key 経由でのみアクセス）
ALTER TABLE popup_history DISABLE ROW LEVEL SECURITY;
