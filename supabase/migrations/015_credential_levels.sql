-- ============================================================
-- Migration 015: credential_levels テーブル (Phase 1B)
-- バッジ定義テーブル。団体オーナーがバッジを作成・管理する。
-- ============================================================

-- credential_levels テーブル
CREATE TABLE credential_levels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  image_url         TEXT,
  sort_order        INT NOT NULL DEFAULT 0,
  claim_token       TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  claim_url_active  BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- RLS有効化
ALTER TABLE credential_levels ENABLE ROW LEVEL SECURITY;

-- オーナーは自分の団体のバッジを管理可能
CREATE POLICY "owner_manage_levels" ON credential_levels
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- 公開読み取り（バッジ情報は公開）
CREATE POLICY "public_read_levels" ON credential_levels
  FOR SELECT USING (true);

-- インデックス
CREATE INDEX idx_credential_levels_org ON credential_levels(organization_id);
CREATE INDEX idx_credential_levels_claim ON credential_levels(claim_token);
