-- §2-8 継続記録（vote_type='continuation'）のスキーマ変更
-- 実行者: CEO（Supabase SQL Editor で手動実行）。CC は実行しない。
-- STEP 1〜3 は 2026-08-01 に本番実行済み。STEP 4 は「票→人」ラベル改修コードの
-- デプロイおよび全体告知と同時に実行する（実行前の値: pairs=1002, total=6490 / 実行後試算: total=5302）。

-- STEP 1【調査・実行済み】制約名の確認
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'votes'::regclass AND contype = 'c'
--   AND pg_get_constraintdef(oid) LIKE '%vote_type%';
-- → conname = votes_vote_type_check

-- STEP 2【実行済み】vote_type CHECK 制約に 'continuation' を追加
ALTER TABLE votes DROP CONSTRAINT votes_vote_type_check;
ALTER TABLE votes ADD CONSTRAINT votes_vote_type_check
  CHECK (vote_type IN ('proof', 'hopeful', 'personality_only', 'continuation'));

-- STEP 3【実行済み】新カラム2本（nullable・DEFAULTなし）
ALTER TABLE votes ADD COLUMN self_reported_repeat boolean;   -- 「2回目以降」自己申告だが過去票なし
ALTER TABLE votes ADD COLUMN continuation_theme text;        -- 継続記録の任意テーマ

-- STEP 4【未実行・デプロイ同時】vote_summary を票数（repeat重み付き）→ 人数（DISTINCT）に差し替え
-- ※「初めて」+過去票ありの再分類行は vote_type='continuation' のまま selected_proof_ids を保持するが、
--   本 VIEW は vote_type='proof' で絞るため集計不算入（仕様 §2-8 どおり）
CREATE OR REPLACE VIEW vote_summary AS
SELECT professional_id, proof_id,
  COUNT(DISTINCT normalized_email)::INTEGER AS vote_count
FROM (
  SELECT professional_id, unnest(selected_proof_ids) AS proof_id, normalized_email
  FROM votes
  WHERE vote_type = 'proof' AND selected_proof_ids IS NOT NULL AND status = 'confirmed'
) t
GROUP BY professional_id, proof_id;

-- STEP 5【検証】
-- SELECT COUNT(*) AS pairs, SUM(vote_count) AS total FROM vote_summary;
