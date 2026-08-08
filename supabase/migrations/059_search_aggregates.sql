-- ============================================================
-- 059: /api/search の Postgres 側集計（X-Day対応・2026-08-08 CEO GO）
--
-- 背景: 「professionals 全件 → votes 全件取得 → JS 集計」は 35,000 プロ規模で
-- メモリ・転送量ともに破綻する（CLAUDE.md スケール既知リスク）。
-- votes の全行を API に運ぶのをやめ、プロ単位の集計行だけを返す RPC を用意する。
-- スコアリング・並び替えの微妙なロジックは従来どおり JS 側（route.ts）に残し、
-- 「データ削減」だけを DB 側へ移す（挙動変更を最小化する方針）。
--
-- 呼び出し側: src/lib/supabase-batch.ts の fetchSearchAggregates / fetchVoiceMatches。
-- RPC 未作成環境では route.ts が従来の JS 集計へフォールバックする（fail-soft）ため、
-- この migration はコードのデプロイ後いつ実行しても安全。既存 VIEW/テーブルには一切触れない。
--
-- 集計定義は route.ts の JS 実装に忠実（§2-8・CLAUDE.md「vote_typeは4種」準拠）:
--   - 件数系(total/recent/rising/last/comment) = status='confirmed' AND vote_type IN ('proof','continuation')
--   - 項目別(proof_item/personality) = 上記から vote_type='continuation' を除外（proof のみ）
--   - 項目別の人数 = DISTINCT COALESCE(normalized_email, 票id)（メール無し票は個別カウント＝JS版と同一。
--     vote_summary VIEW の「NULLメール除外」仕様とは意図的に異なる）
--   - リピーター集計 = confirmed 全 vote_type・normalized_email 単位。
--     level = GREATEST(最古票の session_count('regular'=3/'repeat'=2), 追加記録数(2件以上=3/1件=2))
--   - 既知の差分1点: latest_comment は「created_at が最新のコメント」（JS版は取得順の最後＝
--     実質不定だったため、こちらが本来の意図。voiceSnippet のフォールバックにのみ使用。
--     featured_vote_id 未設定のプロは表示文が変わり得る）
--   - 既知の差分2点: 同点タイブレーク（featuredProof/categoryTopProof の最多項目・voice抜粋の
--     出所コメント）は JS版=取得順 / RPC版=jsonbキー順・created_at最古 で別項目が選ばれ得る
--     （どちらも「同点なら不定」だった挙動の範囲内）
--
-- セキュリティ（レビュー指摘・重大）: 呼び出しは /api/search の service_role クライアント
-- (getSupabaseAdmin) のみ。SECURITY DEFINER は付けず、PUBLIC/anon/authenticated から
-- EXECUTE を REVOKE する（付けたままだと公開 anon キーで PostgREST /rpc/ から直叩きでき、
-- §3-2 検索非公開ゲートの外側でコメント全文の検索オラクルになってしまう）。
--
-- ⚠️ 実行手順（CEO・SQL Editor）:
--   1. このファイル全体を実行
--   2. 末尾の検証SELECT 2本を実行し、行が返ること・型エラーが出ないことを目視
--      （votes.created_at の実型が timestamp の場合でも ::timestamptz キャストで吸収済み）
--   3. realproof.jp で検索を1回実行 → Vercel ログに '[api/search] aggregation=rpc' が
--      出ていること・'[fetchSearchAggregates] rpc error' が出ていないことを確認
-- ============================================================

CREATE OR REPLACE FUNCTION search_pro_vote_aggregates(p_pro_ids uuid[])
RETURNS TABLE (
  professional_id uuid,
  total_proofs integer,
  recent_proofs_30d integer,
  rising_7d integer,
  last_proof_at timestamptz,
  latest_comment text,
  item_vote_counts jsonb,
  item_vote_counts_30d jsonb,
  item_voter_counts jsonb,
  personality_counts jsonb,
  unique_voters integer,
  first_count integer,
  repeater_count integer,
  regular_count integer
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH pv AS (
  SELECT v.id, v.professional_id, v.created_at, v.vote_type, v.comment,
         v.normalized_email, v.selected_proof_ids, v.selected_personality_ids
  FROM votes v
  WHERE v.professional_id = ANY(p_pro_ids)
    AND v.status = 'confirmed'
    AND v.vote_type IN ('proof', 'continuation')
),
base AS (
  SELECT pv.professional_id,
         COUNT(*)::int AS total_proofs,
         COUNT(*) FILTER (WHERE pv.created_at >= now() - interval '30 days')::int AS recent_proofs_30d,
         COUNT(*) FILTER (WHERE pv.created_at >= now() - interval '7 days')::int AS rising_7d,
         MAX(pv.created_at)::timestamptz AS last_proof_at
  FROM pv
  GROUP BY pv.professional_id
),
latest_comment AS (
  SELECT DISTINCT ON (pv.professional_id) pv.professional_id, pv.comment
  FROM pv
  WHERE pv.comment IS NOT NULL AND pv.comment <> ''
  ORDER BY pv.professional_id, pv.created_at DESC, pv.id DESC
),
item_rows AS (
  -- レビュー指摘(中): 配列内の NULL 要素は unnest で NULL 行になり、jsonb_object_agg が
  -- 'field name must not be null' で関数ごと落ちる(=静かに永久フォールバック)ため必ず除去する。
  SELECT * FROM (
    SELECT pv.professional_id,
           unnest(pv.selected_proof_ids) AS item_id,
           pv.created_at,
           COALESCE(NULLIF(pv.normalized_email, ''), pv.id::text) AS voter_key
    FROM pv
    WHERE pv.vote_type <> 'continuation'
      AND pv.selected_proof_ids IS NOT NULL
  ) raw_items
  WHERE raw_items.item_id IS NOT NULL
),
item_agg AS (
  SELECT ir.professional_id, ir.item_id,
         COUNT(*)::int AS vote_count,
         COUNT(*) FILTER (WHERE ir.created_at >= now() - interval '30 days')::int AS vote_count_30d,
         COUNT(DISTINCT ir.voter_key)::int AS voter_count
  FROM item_rows ir
  GROUP BY ir.professional_id, ir.item_id
),
item_json AS (
  SELECT ia.professional_id,
         jsonb_object_agg(ia.item_id, ia.vote_count) AS item_vote_counts,
         jsonb_object_agg(ia.item_id, ia.vote_count_30d) FILTER (WHERE ia.vote_count_30d > 0) AS item_vote_counts_30d,
         jsonb_object_agg(ia.item_id, ia.voter_count) AS item_voter_counts
  FROM item_agg ia
  GROUP BY ia.professional_id
),
per_agg AS (
  SELECT pr.professional_id, pr.per_id, COUNT(*)::int AS cnt
  FROM (
    SELECT pv.professional_id, unnest(pv.selected_personality_ids) AS per_id
    FROM pv
    WHERE pv.vote_type <> 'continuation'
      AND pv.selected_personality_ids IS NOT NULL
  ) pr
  WHERE pr.per_id IS NOT NULL  -- レビュー指摘(中): NULL要素ガード(item_rowsと同じ理由)
  GROUP BY pr.professional_id, pr.per_id
),
per_json AS (
  SELECT pa.professional_id,
         jsonb_object_agg(pa.per_id, pa.cnt) AS personality_counts
  FROM per_agg pa
  GROUP BY pa.professional_id
),
voters AS (
  SELECT v.professional_id, v.normalized_email,
         COUNT(*)::int AS total_count,
         (array_agg(v.session_count ORDER BY v.created_at ASC, v.id ASC))[1] AS first_session_count
  FROM votes v
  WHERE v.professional_id = ANY(p_pro_ids)
    AND v.status = 'confirmed'
    AND v.normalized_email IS NOT NULL
    AND v.normalized_email <> ''
  GROUP BY v.professional_id, v.normalized_email
),
voter_levels AS (
  SELECT vo.professional_id,
         GREATEST(
           CASE vo.first_session_count WHEN 'regular' THEN 3 WHEN 'repeat' THEN 2 ELSE 1 END,
           CASE WHEN vo.total_count - 1 >= 2 THEN 3 WHEN vo.total_count - 1 >= 1 THEN 2 ELSE 1 END
         ) AS level
  FROM voters vo
),
voter_agg AS (
  SELECT vl.professional_id,
         COUNT(*)::int AS unique_voters,
         COUNT(*) FILTER (WHERE vl.level = 1)::int AS first_count,
         COUNT(*) FILTER (WHERE vl.level = 2)::int AS repeater_count,
         COUNT(*) FILTER (WHERE vl.level >= 3)::int AS regular_count
  FROM voter_levels vl
  GROUP BY vl.professional_id
)
SELECT b.professional_id,
       b.total_proofs,
       b.recent_proofs_30d,
       b.rising_7d,
       b.last_proof_at,
       lc.comment AS latest_comment,
       ij.item_vote_counts,
       ij.item_vote_counts_30d,
       ij.item_voter_counts,
       pj.personality_counts,
       COALESCE(va.unique_voters, 0) AS unique_voters,
       COALESCE(va.first_count, 0) AS first_count,
       COALESCE(va.repeater_count, 0) AS repeater_count,
       COALESCE(va.regular_count, 0) AS regular_count
FROM base b
LEFT JOIN latest_comment lc ON lc.professional_id = b.professional_id
LEFT JOIN item_json ij ON ij.professional_id = b.professional_id
LEFT JOIN per_json pj ON pj.professional_id = b.professional_id
LEFT JOIN voter_agg va ON va.professional_id = b.professional_id;
$$;

-- キーワード検索時のコメント全文マッチ（JS の comment.includes(query) と同じ「リテラル部分一致」。
-- LIKE だと % _ のエスケープ問題があるため position() を使う）
CREATE OR REPLACE FUNCTION search_voice_matches(p_pro_ids uuid[], p_query text)
RETURNS TABLE (
  professional_id uuid,
  match_count integer,
  first_comment text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT v.professional_id,
         COUNT(*)::int AS match_count,
         (array_agg(v.comment ORDER BY v.created_at ASC, v.id ASC))[1] AS first_comment
  FROM votes v
  WHERE v.professional_id = ANY(p_pro_ids)
    AND v.status = 'confirmed'
    AND v.vote_type IN ('proof', 'continuation')
    AND v.comment IS NOT NULL
    AND p_query <> ''
    AND position(p_query IN v.comment) > 0
  GROUP BY v.professional_id;
$$;

-- レビュー指摘(重大): 公開 anon キーによる PostgREST /rpc/ 直叩きを塞ぐ。
-- 呼び出しは service_role(getSupabaseAdmin) のみに限定する。
REVOKE ALL ON FUNCTION search_pro_vote_aggregates(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION search_pro_vote_aggregates(uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION search_pro_vote_aggregates(uuid[]) TO service_role;

REVOKE ALL ON FUNCTION search_voice_matches(uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION search_voice_matches(uuid[], text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION search_voice_matches(uuid[], text) TO service_role;

-- 実行後の検証（RETURNING相当）:
--   SELECT * FROM search_pro_vote_aggregates(ARRAY(SELECT id FROM professionals WHERE deactivated_at IS NULL LIMIT 5));
--   SELECT * FROM search_voice_matches(ARRAY(SELECT id FROM professionals LIMIT 50), 'ありがとう');
