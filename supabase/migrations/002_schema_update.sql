-- ============================================
-- 002_schema_update.sql
-- A3: votes更新 / A4: professionals更新 / A5: ビュー作成
-- ============================================

-- ============================================
-- A3: votes テーブル更新
-- ============================================

-- vote_type: 'proof' / 'hopeful' / 'personality_only'
ALTER TABLE votes ADD COLUMN IF NOT EXISTS vote_type TEXT NOT NULL DEFAULT 'proof'
  CHECK (vote_type IN ('proof', 'hopeful', 'personality_only'));

-- 強みプルーフID（最大3つ、proof_items.id を参照）
ALTER TABLE votes ADD COLUMN IF NOT EXISTS selected_proof_ids UUID[];

-- 人柄プルーフID（最大3つ、personality_items.id を参照）
ALTER TABLE votes ADD COLUMN IF NOT EXISTS selected_personality_ids UUID[];

-- ひとことコメント（既存の comment カラムがあればスキップ）
ALTER TABLE votes ADD COLUMN IF NOT EXISTS comment TEXT;

-- ============================================
-- A4: professionals テーブル更新
-- ============================================

-- 選択した強みプルーフID（最大8個、proof_items.id を参照）
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS selected_proofs UUID[];

-- カスタムプルーフ（最大3個）[{id, label, strength_label}]
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS custom_proofs JSONB DEFAULT '[]';

-- オンライン対応可
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS is_online_available BOOLEAN DEFAULT false;

-- 都道府県（プルダウン選択式）
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS prefecture TEXT;

-- 活動エリア（自由記述）
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS area_description TEXT;

-- ============================================
-- A5: ビュー作成
-- ============================================

-- vote_summary: 強みプルーフごとの投票数集計
-- unnest を使うビューは CREATE OR REPLACE できないため DROP 先行
DROP VIEW IF EXISTS vote_summary CASCADE;
CREATE VIEW vote_summary AS
SELECT
  professional_id,
  unnest(selected_proof_ids) AS proof_id,
  COUNT(*) AS vote_count
FROM votes
WHERE vote_type = 'proof'
  AND selected_proof_ids IS NOT NULL
  AND status = 'confirmed'
GROUP BY professional_id, proof_id;

-- personality_summary: 人柄プルーフごとの投票数集計
DROP VIEW IF EXISTS personality_summary CASCADE;
CREATE VIEW personality_summary AS
SELECT
  professional_id,
  unnest(selected_personality_ids) AS personality_id,
  COUNT(*) AS vote_count
FROM votes
WHERE selected_personality_ids IS NOT NULL
  AND status = 'confirmed'
GROUP BY professional_id, personality_id;

-- active_ranking: アクティブランキング（1日あたりの獲得ペース順）
DROP VIEW IF EXISTS active_ranking CASCADE;
CREATE VIEW active_ranking AS
SELECT
  p.id,
  p.name,
  p.prefecture,
  COUNT(v.id) AS total_votes,
  GREATEST(EXTRACT(DAY FROM now() - p.created_at) + 1, 1) AS days_since_registration,
  ROUND(
    COUNT(v.id)::numeric / GREATEST(EXTRACT(DAY FROM now() - p.created_at) + 1, 1),
    4
  ) AS daily_pace
FROM professionals p
LEFT JOIN votes v
  ON v.professional_id = p.id
  AND v.vote_type = 'proof'
  AND v.status = 'confirmed'
GROUP BY p.id
ORDER BY daily_pace DESC;
