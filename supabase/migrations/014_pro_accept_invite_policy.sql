-- ============================================================
-- Migration 014: プロが招待を承認できるRLSポリシー追加
-- Fix: 承認ボタンが403 Forbiddenになるバグ
-- ============================================================

-- プロは自分への招待を承認可能（pending → active への UPDATE）
CREATE POLICY "pro_accept_invite" ON org_members
  FOR UPDATE USING (
    professional_id IN (SELECT id FROM professionals WHERE user_id = auth.uid())
    AND status = 'pending'
  );
