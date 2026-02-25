-- Voice シェアカードのテーマ設定カラムを追加
-- Supabase SQL Editor で実行すること

ALTER TABLE professionals
ADD COLUMN IF NOT EXISTS voice_card_theme JSONB DEFAULT NULL;

COMMENT ON COLUMN professionals.voice_card_theme IS 'Voice シェアカードのテーマ設定。preset名 or カスタムカラー3色 + showProof/showProInfo';
