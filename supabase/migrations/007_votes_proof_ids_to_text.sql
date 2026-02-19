-- ============================================
-- 007: selected_proof_ids を UUID[] → TEXT[] に変更
-- ============================================
-- 理由: カスタムプルーフのIDが "custom_xxx" 形式のためUUID型に合わない
-- selected_personality_ids も同様に TEXT[] に変更（将来のカスタム対応）

-- 依存ビューを先に削除
DROP VIEW IF EXISTS vote_summary CASCADE;
DROP VIEW IF EXISTS personality_summary CASCADE;

-- 型変更
ALTER TABLE votes ALTER COLUMN selected_proof_ids TYPE TEXT[] USING selected_proof_ids::TEXT[];
ALTER TABLE votes ALTER COLUMN selected_personality_ids TYPE TEXT[] USING selected_personality_ids::TEXT[];

-- ビュー再作成
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

CREATE VIEW personality_summary AS
SELECT
  professional_id,
  unnest(selected_personality_ids) AS personality_id,
  COUNT(*) AS vote_count
FROM votes
WHERE selected_personality_ids IS NOT NULL
  AND status = 'confirmed'
GROUP BY professional_id, personality_id;
