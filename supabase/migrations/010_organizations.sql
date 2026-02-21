-- ============================================================
-- Migration 010: organizations テーブル + RLS
-- Phase 1A: Organization Feature (団体機能)
-- ============================================================

-- 団体テーブル
CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id),
  type          TEXT NOT NULL CHECK (type IN ('store', 'credential', 'education')),
  name          TEXT NOT NULL,
  location      TEXT,
  description   TEXT,
  logo_url      TEXT,
  website_url   TEXT,
  booking_url   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- RLS 有効化
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- オーナーはCRUD可能
CREATE POLICY "owner_crud" ON organizations
  FOR ALL USING (owner_id = auth.uid());

-- 全ユーザーが閲覧可能（公開ページ用）
CREATE POLICY "public_read" ON organizations
  FOR SELECT USING (true);

-- インデックス: owner_idで検索効率化
CREATE INDEX idx_organizations_owner_id ON organizations(owner_id);
CREATE INDEX idx_organizations_type ON organizations(type);
