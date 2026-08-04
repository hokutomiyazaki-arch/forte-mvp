-- 038: 認定申請の集計スナップショット（グランドファザリング・CEO決定 2026-08-04）
-- 実行者: CEO（Supabase SQL Editor）。CC は実行しない。
-- 背景: migration 028 STEP 4 で vote_summary が票数(重み付き)→人数(DISTINCT)に切替わり、
--   申請済みの認定カード/賞状に実害（賞状発行不可3件・記載食い違い23件）。
--   方針: 申請済み分は全員「申請時点の票数基準」で発行（遡及して条件を厳しくしない・指示書§2-8）。
--   カードと賞状は必ず同一スナップショットから生成する。

-- ============================================================
-- PART A【カラム追加】
-- ============================================================
ALTER TABLE certification_applications
  ADD COLUMN IF NOT EXISTS stats_snapshot jsonb;

-- ============================================================
-- PART B【バックフィル】既存申請に「申請時点の旧方式(重み付き票数)」の全proof値を保存
--   旧方式定義 = migration 009: 投票行単位・session_count='repeat'は2票・重複排除なし
--   ※ ca.proof_count_at_apply（申請カテゴリの申請時保存値）はそのまま残す（正本）。
--     stats_snapshot はカード面に載る他カテゴリも含めた全proofの申請時値。
-- ============================================================

-- B-1【プレビュー】対象件数（stats_snapshot未設定の申請）と applied_at NULL の有無
-- SELECT count(*) FROM certification_applications WHERE stats_snapshot IS NULL;
-- SELECT count(*) FROM certification_applications WHERE applied_at IS NULL;  -- 0でなければ下のCOALESCEが効く

-- B-2【実行】
UPDATE certification_applications ca
SET stats_snapshot = jsonb_build_object(
  'method', 'weighted_votes_009',
  'captured_at', ca.applied_at,
  'backfilled_at', now(),
  'proofs', COALESCE((
    SELECT jsonb_object_agg(t.proof_id::text, t.cnt)
    FROM (
      SELECT unnest(v.selected_proof_ids) AS proof_id,
             SUM(CASE WHEN v.session_count = 'repeat' THEN 2 ELSE 1 END)::int AS cnt
      FROM votes v
      WHERE v.professional_id = ca.professional_id
        AND v.vote_type = 'proof'
        AND v.status = 'confirmed'
        AND v.selected_proof_ids IS NOT NULL
        AND v.created_at <= COALESCE(ca.applied_at, now())  -- レビュー指摘: applied_at NULL行の全ゼロ凍結防止
      GROUP BY 1
    ) t
  ), '{}'::jsonb)
)
WHERE ca.stats_snapshot IS NULL
RETURNING ca.id, ca.professional_id, ca.category_slug;

-- ============================================================
-- 検証
-- ============================================================
-- ① 全申請にスナップショットが入ったか（0のはず）
-- SELECT count(*) FROM certification_applications WHERE stats_snapshot IS NULL;
-- ② 申請カテゴリのスナップショット値と proof_count_at_apply の比較（数票の差は
--    「申請フォーム表示時点」と「applied_at時点」のタイムラグによる想定内の差）
-- SELECT id, category_slug, proof_count_at_apply,
--        (stats_snapshot->'proofs'->>category_slug::text)::int AS snapshot_value
-- FROM certification_applications
-- ORDER BY applied_at;

-- 巻き戻し: UPDATE certification_applications SET stats_snapshot = NULL;（カラム削除は不要）
