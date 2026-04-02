-- =============================================
-- REALPROOF ハッシュチェーン用カラム追加
-- =============================================

-- 1. votesテーブルにハッシュチェーン用カラムを追加
ALTER TABLE votes
ADD COLUMN IF NOT EXISTS proof_hash TEXT,
ADD COLUMN IF NOT EXISTS prev_hash TEXT,
ADD COLUMN IF NOT EXISTS proof_nonce TEXT;

-- 2. proof_hashにインデックスを追加（検証APIの高速化用）
CREATE INDEX IF NOT EXISTS idx_votes_proof_hash ON votes(proof_hash);

-- 3. 確認
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'votes'
AND column_name IN ('proof_hash', 'prev_hash', 'proof_nonce')
ORDER BY column_name;
