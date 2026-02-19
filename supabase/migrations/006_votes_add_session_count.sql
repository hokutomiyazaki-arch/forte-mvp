-- 006: votes テーブルに session_count / selected_reward_id カラムを追加

-- セッション回数（first=初回, repeat=2回目以降）
ALTER TABLE votes ADD COLUMN IF NOT EXISTS
  session_count TEXT DEFAULT 'first';

-- session_count の CHECK 制約（既存制約がなければ追加）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'votes_session_count_check'
  ) THEN
    ALTER TABLE votes ADD CONSTRAINT votes_session_count_check
      CHECK (session_count IN ('first', 'repeat'));
  END IF;
END $$;

-- 選択されたリワードID
ALTER TABLE votes ADD COLUMN IF NOT EXISTS selected_reward_id UUID;
