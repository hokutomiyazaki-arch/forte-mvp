-- §2-8 継続記録（vote_type='continuation'）のスキーマ変更
-- 実行者: CEO（Supabase SQL Editor で手動実行）。CC は実行しない。
-- STEP 1〜3 は 2026-08-01 に本番実行済み。STEP 4 は「票→人」ラベル改修コードの
-- デプロイおよび全体告知と同時に実行する（実行前の値: pairs=1002, total=6490 / 実行後試算: total=5302）。

-- STEP 1【調査・実行済み】制約名の確認
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'votes'::regclass AND contype = 'c'
--   AND pg_get_constraintdef(oid) LIKE '%vote_type%';
-- → conname = votes_vote_type_check

-- STEP 2【実行済み】vote_type CHECK 制約に 'continuation' を追加（IF EXISTS/NOT NULL で冪等化済み）
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_vote_type_check;
ALTER TABLE votes ADD CONSTRAINT votes_vote_type_check
  CHECK (vote_type IN ('proof', 'hopeful', 'personality_only', 'continuation'));

-- STEP 3【実行済み】新カラム2本（nullable・DEFAULTなし）
ALTER TABLE votes ADD COLUMN IF NOT EXISTS self_reported_repeat boolean;   -- 「2回目以降」自己申告だが過去票なし
ALTER TABLE votes ADD COLUMN IF NOT EXISTS continuation_theme text;        -- 継続記録の任意テーマ

-- STEP 4-0【実行前確認・必須】現行 VIEW の定義と列型を確認する。
-- CREATE OR REPLACE VIEW は列の追加しかできず、列名・順序・型が1つでも違うと
-- "cannot change data type of view column" 等で失敗する（安全側に失敗、データ破壊なし）。
-- SELECT pg_get_viewdef('vote_summary'::regclass, true);
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'vote_summary' ORDER BY ordinal_position;
-- 期待値（migration 009 と同一なら）: professional_id uuid / proof_id text / vote_count integer
-- → 一致していれば STEP 4-A を実行。不一致・エラーになる場合のみ STEP 4-B を使う。

-- STEP 4-A【未実行・デプロイ同時】vote_summary を票数（repeat重み付き）→ 人数（DISTINCT）に差し替え
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

-- STEP 4-B【STEP 4-A が失敗した場合のみ】DROP → CREATE で作り直す。
-- 実行前に依存オブジェクトの有無を必ず確認（依存があれば CASCADE は使わず、依存側を先に洗い出して報告）：
-- SELECT dependent_ns.nspname, dependent_view.relname
-- FROM pg_depend d
-- JOIN pg_rewrite r ON r.oid = d.objid
-- JOIN pg_class dependent_view ON dependent_view.oid = r.ev_class
-- JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent_view.relnamespace
-- WHERE d.refobjid = 'vote_summary'::regclass AND dependent_view.relname <> 'vote_summary';
--
-- DROP VIEW vote_summary;
-- CREATE VIEW vote_summary AS
-- SELECT professional_id, proof_id,
--   COUNT(DISTINCT normalized_email)::INTEGER AS vote_count
-- FROM (
--   SELECT professional_id, unnest(selected_proof_ids) AS proof_id, normalized_email
--   FROM votes
--   WHERE vote_type = 'proof' AND selected_proof_ids IS NOT NULL AND status = 'confirmed'
-- ) t
-- GROUP BY professional_id, proof_id;

-- STEP 5【検証】
-- SELECT COUNT(*) AS pairs, SUM(vote_count) AS total FROM vote_summary;
-- SELECT COUNT(*) FROM vote_summary WHERE vote_count = 0;
--   ↑ normalized_email が NULL の票のみで構成される項目は 0人 で残り得る（実データでは0件のはず）。
--     0件でなければ該当 (professional_id, proof_id) を確認して報告。
