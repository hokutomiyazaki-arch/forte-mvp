-- ============================================
-- Migration 027: qr_tokens にワンタイム機構を追加
-- 既存トークンは未使用扱い（used_at = NULL）
--
-- 背景: X-Day（2026-06-30、35,000人配信）前のLINE拡散攻撃対策。
-- 田中ゆうきさん16票/日（2026-04-27）の調査でDBレベルの
-- ワンタイム実装が未整備であることが判明したため追加する。
-- ============================================

ALTER TABLE qr_tokens
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN qr_tokens.used_at IS
  '投票成立時にNOW()がセットされる。NOT NULLなら使用済みで再投票不可。';

-- 高速検索用: 「未使用のみ有効」検索を効率化
CREATE INDEX IF NOT EXISTS idx_qr_tokens_pro_unused
  ON qr_tokens(professional_id)
  WHERE used_at IS NULL;

-- 確認SQL（コメントアウト、手動で確認用）
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'qr_tokens'
--   AND column_name = 'used_at';

-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'qr_tokens'
--   AND indexname = 'idx_qr_tokens_pro_unused';
