-- ============================================================
-- Migration 013: org_proof_summary + org_aggregate ビュー
-- Phase 1A: Organization Feature (団体機能)
-- ============================================================

-- 団体プルーフサマリー（ダッシュボード用）
CREATE OR REPLACE VIEW org_proof_summary AS
SELECT
  om.organization_id,
  p.id AS professional_id,
  p.name AS professional_name,
  p.photo_url,
  COUNT(v.id) AS total_votes,
  COUNT(v.id) FILTER (WHERE v.selected_personality_ids IS NOT NULL
    AND array_length(v.selected_personality_ids, 1) > 0) AS personality_votes,
  MAX(v.created_at) AS latest_vote_at
FROM org_members om
JOIN professionals p ON om.professional_id = p.id
LEFT JOIN votes v ON v.professional_id = p.id AND v.status = 'confirmed'
WHERE om.status = 'active'
GROUP BY om.organization_id, p.id, p.name, p.photo_url;

-- 団体全体の集計（公開ページ用）
CREATE OR REPLACE VIEW org_aggregate AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  o.type AS organization_type,
  o.location,
  COUNT(DISTINCT om.professional_id) AS active_member_count,
  COUNT(DISTINCT v.id) AS total_org_votes,
  COUNT(v.id) FILTER (
    WHERE v.created_at > now() - INTERVAL '30 days'
  ) AS votes_last_30_days
FROM organizations o
JOIN org_members om ON om.organization_id = o.id AND om.status = 'active'
LEFT JOIN votes v ON v.professional_id = om.professional_id AND v.status = 'confirmed'
GROUP BY o.id, o.name, o.type, o.location;
