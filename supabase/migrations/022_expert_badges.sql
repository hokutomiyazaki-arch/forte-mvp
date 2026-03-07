-- ============================================================
-- Migration 022: エキスパートバッジ用カラム追加
-- professionals に is_founding_member と同パターンでboolean追加
-- 判定: proof_item別の得票数が15票以上の項目をカウント
-- ============================================================

-- ダブルエキスパート: 同一tabで15票以上の項目が2つ以上
ALTER TABLE professionals
ADD COLUMN IF NOT EXISTS is_double_expert boolean DEFAULT false;

-- クロスエキスパート: 異なるtabにまたがって15票以上の項目が2つ以上
ALTER TABLE professionals
ADD COLUMN IF NOT EXISTS is_cross_expert boolean DEFAULT false;

-- トリプルエキスパート: 同一tabで15票以上の項目が3つ以上
ALTER TABLE professionals
ADD COLUMN IF NOT EXISTS is_triple_expert boolean DEFAULT false;

-- クロスマスター: 異なるtabにまたがって15票以上の項目が3つ以上
ALTER TABLE professionals
ADD COLUMN IF NOT EXISTS is_cross_master boolean DEFAULT false;
