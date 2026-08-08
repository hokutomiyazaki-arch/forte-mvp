-- ============================================================
-- Migration 049: 団体VIEWの「プルーフ数」の定義を揃える
-- ============================================================
--
-- 背景（CEO指示・2026-08-06）
-- 団体ページ／団体ダッシュボードの「プルーフ数」は、013_org_views.sql の時点から
-- **status も vote_type も絞らない生カウント**だった。つまり以下を全部数えていた:
--   - 未確認票（status <> 'confirmed'）
--   - 期待票（vote_type = 'hopeful'）＝まだ施術を受けていない人の票
--   - 人柄のみ（vote_type = 'personality_only'）
-- 個人ダッシュボード・公開カードのどちらよりも広い集合で、過大表示になっていた。
--
-- 「施術を受けた記録」の正は /api/vote-count と同じ:
--   status = 'confirmed' AND vote_type IN ('proof', 'continuation')
-- ※ continuation = 2回目以降（リピーターの記録）。これを落とすと同日の admin 集計事故
--   （2026-08-06）と同じ穴になるので必ず含める。
--
-- 併せて DISTINCT 漏れも直す
-- org_members は 1プロ＝複数行（バッジごと1行）。LEFT JOIN で行が複製されるため、
-- DISTINCT の無い COUNT は複数バッジ保持者を二重・三重カウントする。
--   - org_aggregate.votes_last_30_days: DISTINCT 無し → 付ける
--   - org_proof_summary.total_votes:    DISTINCT 無し → 付ける
-- （この二重カウントを避けるために API 側が JS で数え直していた箇所がある。
--   VIEW 側が正しくなるので、その回避策は将来的に不要になる）
--
-- 変更の性質
--   - CREATE OR REPLACE VIEW のみ。**データは一切書き換えない**（非破壊）。
--   - カラム名・並び・型（bigint）は変更なし。CREATE OR REPLACE の制約を満たす。
--   - JOIN は LEFT のまま。集計側を FILTER で絞るので、票ゼロの団体・メンバーも
--     従来どおり 0 として行に残る（WHERE で絞ると行ごと消えるため FILTER を使う）。
--   - personality_votes の定義は**変えない**。人柄票は vote_type='personality_only' で
--     入ることがあり、JOIN 自体を絞ると数えられなくなるため。
--
-- ⚠️ 数値は下がる方向に動く。過大だったものが正しくなる。
-- ============================================================

-- ── 実行前の確認（どれだけ動くかを先に見る）──────────────────
-- SELECT
--   COUNT(*) FILTER (WHERE TRUE)                                             AS 生カウント,
--   COUNT(*) FILTER (WHERE status = 'confirmed')                             AS 確定のみ,
--   COUNT(*) FILTER (WHERE status = 'confirmed'
--                      AND vote_type IN ('proof','continuation'))            AS 新定義
-- FROM votes;

-- ── 団体プルーフサマリー（メンバー別）──────────────────────
CREATE OR REPLACE VIEW org_proof_summary AS
SELECT
  om.organization_id,
  p.id AS professional_id,
  p.name AS professional_name,
  p.photo_url,
  COUNT(DISTINCT v.id) FILTER (
    WHERE v.status = 'confirmed'
      AND v.vote_type IN ('proof', 'continuation')
  ) AS total_votes,
  COUNT(DISTINCT v.id) FILTER (
    WHERE v.selected_personality_ids IS NOT NULL
      AND array_length(v.selected_personality_ids, 1) > 0
  ) AS personality_votes,
  MAX(v.created_at) AS latest_vote_at
FROM org_members om
JOIN professionals p ON om.professional_id = p.id
LEFT JOIN votes v ON v.professional_id = p.id
WHERE om.status = 'active'
GROUP BY om.organization_id, p.id, p.name, p.photo_url;

-- ── 団体全体の集計（公開ページ・OGP用）──────────────────────
CREATE OR REPLACE VIEW org_aggregate AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  o.type AS organization_type,
  o.location,
  COUNT(DISTINCT om.professional_id) AS active_member_count,
  COUNT(DISTINCT v.id) FILTER (
    WHERE v.status = 'confirmed'
      AND v.vote_type IN ('proof', 'continuation')
  ) AS total_org_votes,
  COUNT(DISTINCT v.id) FILTER (
    WHERE v.status = 'confirmed'
      AND v.vote_type IN ('proof', 'continuation')
      AND v.created_at > now() - INTERVAL '30 days'
  ) AS votes_last_30_days
FROM organizations o
JOIN org_members om ON om.organization_id = o.id AND om.status = 'active'
LEFT JOIN votes v ON v.professional_id = om.professional_id
GROUP BY o.id, o.name, o.type, o.location;

-- ── 実行後の検証 ────────────────────────────────────────
-- SELECT organization_name, active_member_count, total_org_votes, votes_last_30_days
-- FROM org_aggregate
-- ORDER BY total_org_votes DESC;
