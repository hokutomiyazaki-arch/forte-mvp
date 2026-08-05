-- 042: サービス・案内タブの写真(最大6枚)・紹介動画(YouTube)
-- 実行者: CEO(Supabase SQL Editor で手動実行)。CC は実行しない。
--
-- 背景: プロフィール表示の情報階層(§15-3・2026-08-04・田中さんの提案から)。
--   写真・動画(YouTube埋め込み含む)は「サービス・案内」タブに置く。
--
-- gallery_image_urls(text[]): 最大6枚はアプリ側で制御(DBに制約は設けない)。
-- intro_video_url(text): YouTubeの動画URLをそのまま保存(videoIdは表示側でその都度抽出)。
-- どちらもDEFAULTを付けない(rp-reference §1絶対ルール・想定外INSERTへの値混入を防ぐ)。
-- 既存行は追加直後すべてNULL。コードはカラム未作成でも壊れないfail-soft
-- (select('*')はサイレントに既存カラムのみ返す。保存はPGRST204検知で該当キー除外して1回だけ再試行)。

ALTER TABLE professionals ADD COLUMN IF NOT EXISTS gallery_image_urls text[];
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS intro_video_url text;

-- Storage バケット: gallery-images (avatars バケットと同じパターン。023_bug_reports.sql も同型)
INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery-images', 'gallery-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "gallery-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gallery-images');

CREATE POLICY "gallery-images: authenticated upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'gallery-images' AND auth.role() = 'authenticated');

-- 検証
-- SELECT column_name, column_default FROM information_schema.columns
--   WHERE table_name = 'professionals' AND column_name IN ('gallery_image_urls', 'intro_video_url');
-- SELECT count(*) FROM professionals WHERE gallery_image_urls IS NOT NULL OR intro_video_url IS NOT NULL;  -- 0(実行直後)
-- SELECT id FROM storage.buckets WHERE id = 'gallery-images';

-- 巻き戻し(神山事件プロトコル準拠): DROP COLUMN する場合は
--   ① `column_default` が付いていないことを確認(本migrationではDEFAULT未設定)
--   ② 上記の設定済み件数SELECTでCEOに報告
--   ③ 確認後 `ALTER TABLE professionals DROP COLUMN gallery_image_urls;` / `DROP COLUMN intro_video_url;` を実行
