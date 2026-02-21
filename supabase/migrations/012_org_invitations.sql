-- ============================================================
-- Migration 012: org_invitations テーブル + RLS
-- Phase 1A: Organization Feature (団体機能)
-- ============================================================

-- 招待管理テーブル（メール招待用）
CREATE TABLE org_invitations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  credential_level_id UUID,  -- NULL for Phase 1A
  invited_email       TEXT NOT NULL,
  invite_token        TEXT NOT NULL UNIQUE,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at          TIMESTAMPTZ DEFAULT now(),
  expires_at          TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days'
);

-- RLS 有効化
ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

-- オーナーは自分の団体の招待を管理可能
CREATE POLICY "owner_manage" ON org_invitations
  FOR ALL USING (
    organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
  );

-- インデックス
CREATE INDEX idx_org_invitations_organization_id ON org_invitations(organization_id);
CREATE INDEX idx_org_invitations_invite_token ON org_invitations(invite_token);
CREATE INDEX idx_org_invitations_invited_email ON org_invitations(invited_email);
