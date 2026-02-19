-- 投票重みづけ: first=1, repeat=2
-- vote_summary, personality_summary, active_ranking のビューを再作成

-- vote_summary
DROP VIEW IF EXISTS vote_summary CASCADE;
CREATE VIEW vote_summary AS
SELECT
  professional_id,
  unnest(selected_proof_ids) AS proof_id,
  SUM(CASE WHEN session_count = 'repeat' THEN 2 ELSE 1 END)::INTEGER AS vote_count
FROM votes
WHERE vote_type = 'proof'
  AND selected_proof_ids IS NOT NULL
  AND status = 'confirmed'
GROUP BY professional_id, proof_id;

-- personality_summary
DROP VIEW IF EXISTS personality_summary CASCADE;
CREATE VIEW personality_summary AS
SELECT
  professional_id,
  unnest(selected_personality_ids) AS personality_id,
  SUM(CASE WHEN session_count = 'repeat' THEN 2 ELSE 1 END)::INTEGER AS vote_count
FROM votes
WHERE selected_personality_ids IS NOT NULL
  AND status = 'confirmed'
GROUP BY professional_id, personality_id;

-- active_ranking
DROP VIEW IF EXISTS active_ranking CASCADE;
CREATE VIEW active_ranking AS
SELECT
  p.id,
  p.name,
  p.prefecture,
  SUM(CASE WHEN v.session_count = 'repeat' THEN 2 ELSE 1 END)::INTEGER AS total_votes,
  GREATEST(EXTRACT(DAY FROM now() - p.created_at) + 1, 1) AS days_since_registration,
  ROUND(
    SUM(CASE WHEN v.session_count = 'repeat' THEN 2 ELSE 1 END)::numeric
    / GREATEST(EXTRACT(DAY FROM now() - p.created_at) + 1, 1),
    4
  ) AS daily_pace
FROM professionals p
LEFT JOIN votes v
  ON v.professional_id = p.id
  AND v.vote_type = 'proof'
  AND v.status = 'confirmed'
GROUP BY p.id, p.name, p.prefecture, p.created_at;
