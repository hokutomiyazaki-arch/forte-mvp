-- ============================================
-- proof_items / personality_items RLS修正
-- ポリシーが未適用の場合に備えて、既存があればスキップ
-- ============================================

-- RLS有効化（既に有効でもエラーにならない）
ALTER TABLE proof_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE personality_items ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーを削除してから再作成（冪等性を確保）
DROP POLICY IF EXISTS "proof_items_select_all" ON proof_items;
CREATE POLICY "proof_items_select_all" ON proof_items
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "personality_items_select_all" ON personality_items;
CREATE POLICY "personality_items_select_all" ON personality_items
  FOR SELECT USING (true);
