-- 034: 「連携候補」→「気になるプロ」リネーム ＋ 029以降の bookmarks 差分同期（1回きり）
-- 実行者: CEO（Supabase SQL Editor で手動実行）。CC は実行しない。
-- 背景: カード♡はプロ専用「気になるプロ」privateリストに一本化（CEO決定A案・2026-08-03）。
--   029 は 8/1 時点の bookmarks を一回コピーしただけなので、それ以降にプロが付けた♡を
--   privateリストへ取り込み、リスト名を確定名「気になるプロ」へ揃える。
-- ⚠️ PART A 実行後は、029 の冪等ガード（title='連携候補'）が効かなくなるため
--    029 は二度と再実行しないこと。
-- ⚠️ PART B は「新♡コードのデプロイと同時か直前」に1回だけ実行し、以後は流さないこと。
--    （デプロイ後にプロが♡をオフにしても bookmarks 行は残るため、後から B を流すと
--      本人が意図的に外したピンが復活してしまう）

-- ============================================================
-- PART A【リネーム】既存の「連携候補」privateリスト → 「気になるプロ」
-- ============================================================

-- A-1【プレビュー】対象件数の確認（実行して件数を見る）
-- SELECT count(*) FROM referral_lists WHERE visibility = 'private' AND title = '連携候補';

-- A-2【実行】
UPDATE referral_lists SET title = '気になるプロ'
 WHERE visibility = 'private' AND title = '連携候補'
RETURNING id, owner_id;

-- ============================================================
-- PART B【差分同期】029以降にプロが付けた♡（bookmarks）を privateリストへ取り込む
--   二重安全装置は 029 と同一: ①所有者が有効プロ ②対象も有効プロ ③自分自身は除外
--   ④所有者のいずれかのprivateリストに既に入っていればスキップ ⑤UNIQUE(list_id,pro_id)
-- ============================================================

-- B-1【プレビュー】取り込み対象件数の確認
-- SELECT count(*)
-- FROM bookmarks b
-- JOIN professionals owner ON owner.user_id = b.user_id AND owner.deactivated_at IS NULL
-- JOIN professionals target ON target.id = b.professional_id AND target.deactivated_at IS NULL
-- WHERE owner.id <> b.professional_id
--   AND NOT EXISTS (
--     SELECT 1 FROM referral_list_items i
--     JOIN referral_lists l2 ON l2.id = i.list_id
--      AND l2.owner_id = owner.id AND l2.visibility = 'private'
--     WHERE i.pro_id = b.professional_id
--   );

-- B-2【実行】privateリストを1本も持たない所有プロに「気になるプロ」を作成
--   （B-3と同じ絞り込みを適用し、実際に取り込む行が無い所有者には空リストを作らない）
INSERT INTO referral_lists (owner_id, title, visibility)
SELECT DISTINCT owner.id, '気になるプロ', 'private'
FROM bookmarks b
JOIN professionals owner ON owner.user_id = b.user_id AND owner.deactivated_at IS NULL
JOIN professionals target ON target.id = b.professional_id AND target.deactivated_at IS NULL
WHERE owner.id <> b.professional_id
  AND NOT EXISTS (
    SELECT 1 FROM referral_lists rl
    WHERE rl.owner_id = owner.id AND rl.visibility = 'private'
  )
RETURNING id, owner_id;

-- B-3【実行】差分を各所有プロの最古のprivateリストへ取り込み
INSERT INTO referral_list_items (list_id, pro_id, consent_status, created_at)
SELECT oldest.id, b.professional_id, 'pending', b.created_at
FROM bookmarks b
JOIN professionals owner ON owner.user_id = b.user_id AND owner.deactivated_at IS NULL
JOIN professionals target ON target.id = b.professional_id AND target.deactivated_at IS NULL
JOIN LATERAL (
  SELECT rl.id FROM referral_lists rl
  WHERE rl.owner_id = owner.id AND rl.visibility = 'private'
  ORDER BY rl.created_at ASC, rl.id ASC
  LIMIT 1
) oldest ON true
WHERE owner.id <> b.professional_id
  AND NOT EXISTS (
    SELECT 1 FROM referral_list_items i
    JOIN referral_lists l2 ON l2.id = i.list_id
     AND l2.owner_id = owner.id AND l2.visibility = 'private'
    WHERE i.pro_id = b.professional_id
  )
ON CONFLICT (list_id, pro_id) DO NOTHING
RETURNING id, list_id, pro_id;

-- ============================================================
-- 検証
-- ============================================================
-- SELECT count(*) AS renamed FROM referral_lists WHERE visibility='private' AND title='気になるプロ';
-- SELECT count(*) AS remaining_old FROM referral_lists WHERE visibility='private' AND title='連携候補';  -- 0のはず
-- （B-1 のプレビューSQLを再実行 → 0件になっていれば取り込み完了）
