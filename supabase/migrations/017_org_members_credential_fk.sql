-- ============================================================
-- Migration 017: org_members.credential_level_id FK制約追加
-- Phase 1Aでは credential_levels テーブルが未作成だったため
-- FK制約なしで定義されていた。Phase 1Bで追加。
-- ============================================================

ALTER TABLE org_members
  ADD CONSTRAINT org_members_credential_level_id_fkey
  FOREIGN KEY (credential_level_id) REFERENCES credential_levels(id);
