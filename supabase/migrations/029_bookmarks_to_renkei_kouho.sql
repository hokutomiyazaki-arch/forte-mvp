-- §3-1 お気に入り（bookmarks）→ 連携候補（referral_lists の非公開デフォルトリスト）移行
-- 実行者: CEO（Supabase SQL Editor で手動実行）。CC は実行しない。
-- 【移行方針（Phase 0 調査に基づく）】
--   ・bookmarks は現状 150行・所有者53人。所有者が professionals に実在する行のみ移行する
--     （クライアントのみ6行・どちらにも該当なし25行は移行対象外＝bookmarks に残す。既存の
--       クライアント向け「♡気になる」機能は無変更で残るため、残しても実害なし）
--   ・consent_status='pending' で移行（指示書§3-1: 非公開リストなので承諾不要だが、
--     公開リストへ移す際に pending から開始するため approved にしない）
--   ・bookmarks 自体は削除しない（既存データは削除・破棄しない＝指示書§0-5）

-- STEP 1【調査】移行対象件数の確認（実行して件数を報告）
-- SELECT
--   (SELECT COUNT(*) FROM bookmarks) AS total_bookmarks,
--   (SELECT COUNT(*) FROM bookmarks b
--     JOIN professionals p ON p.user_id = b.user_id AND p.deactivated_at IS NULL) AS migratable,
--   (SELECT COUNT(DISTINCT p.id) FROM bookmarks b
--     JOIN professionals p ON p.user_id = b.user_id AND p.deactivated_at IS NULL) AS owner_pros;

-- STEP 2【バックアップ】
CREATE TABLE IF NOT EXISTS bookmarks_backup_20260801 AS SELECT * FROM bookmarks;

-- STEP 3【プレビュー】作成されるデフォルトリスト（プロ別 items 数）
-- SELECT p.id AS owner_pro_id, p.name, COUNT(*) AS items
-- FROM bookmarks b
-- JOIN professionals p ON p.user_id = b.user_id AND p.deactivated_at IS NULL
-- GROUP BY p.id, p.name ORDER BY items DESC;

-- STEP 4-1【実行】所有プロごとに非公開デフォルトリスト「連携候補」を作成（既存なければ）
INSERT INTO referral_lists (owner_id, title, visibility)
SELECT DISTINCT p.id, '連携候補', 'private'
FROM bookmarks b
JOIN professionals p ON p.user_id = b.user_id AND p.deactivated_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM referral_lists rl
  WHERE rl.owner_id = p.id AND rl.title = '連携候補' AND rl.visibility = 'private'
)
RETURNING id, owner_id;

-- STEP 4-2【実行】bookmarks を referral_list_items へ移行
-- 二重安全装置: ①所有者が有効プロ ②対象も有効プロ ③自分自身は除外 ④重複は UNIQUE でスキップ
INSERT INTO referral_list_items (list_id, pro_id, consent_status, created_at)
SELECT rl.id, b.professional_id, 'pending', b.created_at
FROM bookmarks b
JOIN professionals owner ON owner.user_id = b.user_id AND owner.deactivated_at IS NULL
JOIN referral_lists rl ON rl.owner_id = owner.id AND rl.title = '連携候補' AND rl.visibility = 'private'
JOIN professionals target ON target.id = b.professional_id AND target.deactivated_at IS NULL
WHERE owner.id <> b.professional_id
ON CONFLICT (list_id, pro_id) DO NOTHING
RETURNING id;

-- STEP 5【検証】
-- SELECT COUNT(*) AS lists FROM referral_lists WHERE title = '連携候補' AND visibility = 'private';
-- SELECT COUNT(*) AS items FROM referral_list_items;
-- SELECT COUNT(*) AS backup_rows FROM bookmarks_backup_20260801;  -- = STEP 1 の total_bookmarks
