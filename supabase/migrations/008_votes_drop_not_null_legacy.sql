-- ============================================
-- 008: votes テーブルの旧カラム NOT NULL 制約を解除
-- ============================================
-- 新コード（C1改修後）では以下の旧カラムを使わなくなったため
-- NOT NULL のままだと INSERT 時にエラーになる

-- 1. result_category: 旧「結果フォルテ」→ 新コードでは selected_proof_ids を使用
ALTER TABLE votes ALTER COLUMN result_category DROP NOT NULL;

-- 2. client_user_id: 旧「投票者のauth user ID」→ 新コードではメールベース投票のため null 許容
ALTER TABLE votes ALTER COLUMN client_user_id DROP NOT NULL;

-- 3. personality_categories はデフォルト '{}' で NOT NULL ではないのでそのまま

-- 確認: UNIQUE制約の変更
-- 旧: UNIQUE(professional_id, client_user_id) → メールベース投票では client_user_id が null なので機能しない
-- 新: UNIQUE(professional_id, voter_email) が必要（既に 002 で追加済みならスキップ）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'votes_professional_id_voter_email_key'
  ) THEN
    -- voter_email のユニーク制約を追加（同じプロ×同じメールは1回のみ）
    ALTER TABLE votes ADD CONSTRAINT votes_professional_id_voter_email_key
      UNIQUE (professional_id, voter_email);
  END IF;
END $$;
