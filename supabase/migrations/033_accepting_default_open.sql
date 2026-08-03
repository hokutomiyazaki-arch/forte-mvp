-- §2-2 先行テスト第3弾: ⚪️未設定の廃止・既定を「受付中」に（fail-open）
-- 実行者: CEO（Supabase SQL Editor で手動実行）。CC は実行しない。

-- ============================================================
-- PART A【今すぐ実行】新規レコードの既定値を open に
-- （コード側は accepting_status IS NULL を open として扱う fail-open 実装済みのため、
--   この DEFAULT 変更は「以後の新規プロ」の値を明示的に揃えるためのもの）
-- ============================================================

ALTER TABLE professionals ALTER COLUMN accepting_status SET DEFAULT 'open';

-- 検証:
-- SELECT column_default FROM information_schema.columns
--   WHERE table_name = 'professionals' AND column_name = 'accepting_status';  -- 'open'::text

-- ============================================================
-- PART B【実行しない・全体公開（FEATURE_REFERRAL_LISTS='all' 切替）の告知と同時に実行】
-- 既存 NULL の一括 UPDATE と NOT NULL 化。
-- 告知前に実行すると、本人が何もしていないのに公開カードの表示条件が変わるため、
-- 必ず告知（「紹介の受付は初期状態でONになっています。受け付けたくない場合は
-- ホーム画面のスライダーでオフにしてください」）と同じタイミングで行うこと。
-- ============================================================

-- STEP 1【調査】対象件数
-- SELECT COUNT(*) FROM professionals WHERE accepting_status IS NULL;

-- STEP 2【実行・告知と同時】
-- UPDATE professionals SET accepting_status = 'open'
-- WHERE accepting_status IS NULL
-- RETURNING id;

-- STEP 3【実行・STEP 2 の後】
-- ALTER TABLE professionals ALTER COLUMN accepting_status SET NOT NULL;

-- STEP 4【検証】
-- SELECT accepting_status, COUNT(*) FROM professionals GROUP BY accepting_status;
