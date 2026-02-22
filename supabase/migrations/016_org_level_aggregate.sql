-- ============================================================
-- Migration 016: org_level_aggregate ビュー (Phase 1B)
-- credential_levelごとの取得者数・投票集計ビュー
-- ============================================================

CREATE OR REPLACE VIEW org_level_aggregate AS
SELECT
  cl.id AS level_id,
  cl.organization_id,
  cl.name AS level_name,
  cl.image_url,
  cl.sort_order,
  COUNT(DISTINCT om.professional_id) AS member_count,
  COALESCE(SUM(vs.total_votes), 0) AS total_votes
FROM credential_levels cl
LEFT JOIN org_members om
  ON om.credential_level_id = cl.id
  AND om.status = 'active'
LEFT JOIN (
  SELECT professional_id, SUM(vote_count) AS total_votes
  FROM vote_summary
  GROUP BY professional_id
) vs ON vs.professional_id = om.professional_id
GROUP BY cl.id, cl.organization_id, cl.name, cl.image_url, cl.sort_order
ORDER BY cl.sort_order;
