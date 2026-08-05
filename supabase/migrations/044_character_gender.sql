-- 044: タイプ分析キャラクターの性別出し分け(2026-08-05・CEO承認)
-- 実行者: CEO(Supabase SQL Editor で手動実行)。CC は実行しない。
--
-- 背景: personality_items.image_url(男女共通デフォルト画像)を、プロが選んだ
--   character_gender('male'|'female'|'neutral'|null)に応じて /images/personality-types/{gender}/{basename}
--   へ差し替える(アプリ側 resolveCharacterImageUrl・src/lib/character-image.ts)。
--   'neutral'(まんじゅうのまま・明示選択)は male/female どちらでもないため変換対象外
--   (resolveCharacterImageUrlはmale/female以外は素通し=デフォルト画像のまま)。
--
-- character_gender(text): DEFAULTを付けない(rp-reference §1絶対ルール・想定外INSERTへの値混入を防ぐ)。
-- 既存行は追加直後すべてNULL(=未選択/デフォルト画像)。コードはカラム未作成でも壊れないfail-soft
-- (select('*')はサイレントに既存カラムのみ返す。保存はPGRST204/42703検知で該当キー除外して1回だけ再試行)。
--
-- 2026-08-05追記: CHECKに'neutral'を追加(実行済みDBと一致させるためファイルのみ更新。SQLは実行済み)。

ALTER TABLE professionals ADD COLUMN IF NOT EXISTS character_gender text;

ALTER TABLE professionals
  ADD CONSTRAINT professionals_character_gender_check
  CHECK (character_gender IS NULL OR character_gender IN ('male', 'female', 'neutral'));

-- 検証
-- SELECT column_name, column_default FROM information_schema.columns
--   WHERE table_name = 'professionals' AND column_name = 'character_gender';
-- SELECT count(*) FROM professionals WHERE character_gender IS NOT NULL;  -- 0(実行直後)

-- 巻き戻し(神山事件プロトコル準拠): DROP COLUMN する場合は
--   ① `column_default` が付いていないことを確認(本migrationではDEFAULT未設定)
--   ② 上記の設定済み件数SELECTでCEOに報告
--   ③ 確認後 `ALTER TABLE professionals DROP CONSTRAINT professionals_character_gender_check;`
--      → `ALTER TABLE professionals DROP COLUMN character_gender;` を実行
