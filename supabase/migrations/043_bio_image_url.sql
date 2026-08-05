-- 043: 自己紹介の写真(1枚・任意)
-- 実行者: CEO(Supabase SQL Editor で手動実行)。CC は実行しない。
--
-- 背景: カードページの自己紹介ブロック(BIO)を「続きを読む」で展開した時のみ表示する
--   写真1枚(2026-08-05・CEO指示)。バケットは既存の gallery-images(042で作成済み)を再利用し、
--   {userId}/bio/{ts}.jpg に保存する(バケット新規作成・ポリシー追加は不要)。
--
-- bio_image_url(text): DEFAULTを付けない(rp-reference §1絶対ルール・想定外INSERTへの値混入を防ぐ)。
-- 既存行は追加直後すべてNULL。コードはカラム未作成でも壊れないfail-soft
-- (select('*')はサイレントに既存カラムのみ返す。保存はPGRST204検知で該当キー除外して1回だけ再試行)。

ALTER TABLE professionals ADD COLUMN IF NOT EXISTS bio_image_url text;

-- 検証
-- SELECT column_name, column_default FROM information_schema.columns
--   WHERE table_name = 'professionals' AND column_name = 'bio_image_url';
-- SELECT count(*) FROM professionals WHERE bio_image_url IS NOT NULL;  -- 0(実行直後)

-- 巻き戻し(神山事件プロトコル準拠): DROP COLUMN する場合は
--   ① `column_default` が付いていないことを確認(本migrationではDEFAULT未設定)
--   ② 上記の設定済み件数SELECTでCEOに報告
--   ③ 確認後 `ALTER TABLE professionals DROP COLUMN bio_image_url;` を実行
