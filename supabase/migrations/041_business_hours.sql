-- 041: プロの受付時間(構造化版)
-- 実行者: CEO(Supabase SQL Editor で手動実行)。CC は実行しない。
--
-- 背景: 日時選択UX改善(2026-08-05・CEO指示・追加3)。紹介予約の相談フォーム
--   (ReferralRequestForm)で、受け手プロの受付時間・定休日を希望日時選択の上に表示し、
--   選択枠が受付時間外/定休日の可能性がある場合に警告(ブロックしない)を出すために使う。
--
-- business_hours(jsonb): 形は以下を単一情報源とする(src/lib/referral-format.ts の
--   BusinessHours interface と一致させること)。
--   {"start": "10:00", "end": "20:00", "closed_days": ["wed", "sun"]}
--   - start/end: "HH:mm"文字列(30分刻み想定・両方任意)。
--   - closed_days: 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun' の配列(任意)。
--   - すべて未設定ならnull(DEFAULTを付けない・rp-reference §1絶対ルール・想定外INSERTへの
--     値混入を防ぐ)。既存行は追加直後すべてNULL。
--
-- 巻き戻し(神山事件プロトコル準拠): DROP COLUMN する場合は
--   ① `column_default` が付いていないことを確認(本migrationではDEFAULT未設定)
--   ② `SELECT count(*) FROM professionals WHERE business_hours IS NOT NULL;` で
--      設定済み件数を確認してからCEOに報告
--   ③ 上記確認後 `ALTER TABLE professionals DROP COLUMN business_hours;` を実行

ALTER TABLE professionals ADD COLUMN IF NOT EXISTS business_hours jsonb;

-- 検証
-- SELECT column_name, column_default FROM information_schema.columns
--   WHERE table_name = 'professionals' AND column_name = 'business_hours';
-- SELECT count(*) FROM professionals WHERE business_hours IS NOT NULL;  -- 0(実行直後)
