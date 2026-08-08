-- 057_referral_list_fk_on_delete.sql
-- 【任意・未実行でも動く】紹介リスト削除を DB 側でも安全にする
--
-- 背景（CEO報告 2026-08-06「リスト削除できない。なぜ？」）:
--   referral_bookings.list_id と professionals.delegate_list_id が
--   referral_lists(id) を **ON DELETE 指定なし** で参照している（migration 032）。
--   そのため、そのリスト経由の予約が1件でもあると DELETE が 23503 で失敗し、
--   画面には「リストの削除に失敗しました」としか出なかった。
--
--   アプリ側は同日の修正で、削除の前に両方の参照を null にするようにした
--   （src/app/api/referral/lists/[list_id]/route.ts）。**このSQLを実行しなくても削除はできる。**
--   ここでは「アプリを通らない経路（SQL Editor から直接消す等）でも同じ結果になる」ように
--   制約そのものを直しておく。
--
-- 安全性: データは1行も変わらない（制約の付け替えのみ）。
--   ON DELETE SET NULL にしても、紹介の実体（誰が誰に紹介したか）は
--   referral_bookings.sender_pro_id に残るので記録は失われない。

-- STEP 1【プレビュー】現在の制約名を確認する（環境により名前が違う場合がある）
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE contype = 'f'
--    AND confrelid = 'referral_lists'::regclass;
--   期待: referral_bookings_list_id_fkey / professionals_delegate_list_id_fkey などが並ぶ

-- STEP 2【実行】STEP 1 で確認した名前に合わせること
ALTER TABLE referral_bookings
  DROP CONSTRAINT IF EXISTS referral_bookings_list_id_fkey;
ALTER TABLE referral_bookings
  ADD CONSTRAINT referral_bookings_list_id_fkey
  FOREIGN KEY (list_id) REFERENCES referral_lists(id) ON DELETE SET NULL;

ALTER TABLE professionals
  DROP CONSTRAINT IF EXISTS professionals_delegate_list_id_fkey;
ALTER TABLE professionals
  ADD CONSTRAINT professionals_delegate_list_id_fkey
  FOREIGN KEY (delegate_list_id) REFERENCES referral_lists(id) ON DELETE SET NULL;

-- STEP 3【検証】
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE contype = 'f' AND confrelid = 'referral_lists'::regclass;
--   期待: 上記2本に ON DELETE SET NULL が付いていること
