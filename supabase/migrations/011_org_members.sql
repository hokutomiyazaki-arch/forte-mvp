-- ============================================================
-- Migration 011: org_members テーブル + RLS
-- Phase 1A: Organization Feature (団体機能)
-- ============================================================

-- 団体×プロの所属関係テーブル
CREATE TABLE org_members (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  professional_id     UUID NOT NULL REFERENCES professionals(id),
  credential_level_id UUID,  -- NULL for Phase 1A (stores). Used in Phase 1B for badges
  role                TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'manager')),
  is_owner            BOOLEAN DEFAULT false,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'removed')),
  invited_at          TIMESTAMPTZ DEFAULT now(),
  accepted_at         TIMESTAMPTZ,
  removed_at          TIMESTAMPTZ,

  UNIQUE(organization_id, professional_id, credential_level_id)
);

-- RLS 有効化
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

-- オーナーは自分の団体のメンバーを管理可能
CREATE POLICY "owner_manage" ON org_members
  FOR ALL USING (
    organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
  );

-- プロは自分の所属情報を閲覧可能
CREATE POLICY "pro_read_own" ON org_members
  FOR SELECT USING (
    professional_id IN (SELECT id FROM professionals WHERE user_id = auth.uid())
  );

-- プロは「店舗」からのみ自分で離脱可能（status → 'removed' への UPDATE）
CREATE POLICY "pro_leave_store" ON org_members
  FOR UPDATE USING (
    professional_id IN (SELECT id FROM professionals WHERE user_id = auth.uid())
    AND organization_id IN (SELECT id FROM organizations WHERE type = 'store')
  );

-- インデックス
CREATE INDEX idx_org_members_organization_id ON org_members(organization_id);
CREATE INDEX idx_org_members_professional_id ON org_members(professional_id);
CREATE INDEX idx_org_members_status ON org_members(status);
