-- 005: rewards テーブルに title カラムを追加
-- titleが存在しない場合のみ追加（冪等）
-- selfcare/freeform カテゴリでプロがカスタムタイトルを設定するために使用

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rewards'
      AND column_name = 'title'
  ) THEN
    ALTER TABLE public.rewards ADD COLUMN title TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- reward_type の CHECK 制約があれば削除して新カテゴリに対応
-- （制約名が不明なため、存在する場合のみ削除）
DO $$
DECLARE
  _constraint_name TEXT;
BEGIN
  SELECT con.conname INTO _constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE rel.relname = 'rewards'
    AND nsp.nspname = 'public'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%reward_type%';

  IF _constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.rewards DROP CONSTRAINT ' || _constraint_name;
  END IF;
END $$;

-- RLS ポリシー確認・追加（冪等）
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

-- SELECT: プロは自分のリワードを読める + 全ユーザーがリワードを読める（投票画面で必要）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rewards' AND policyname = 'rewards_select_all'
  ) THEN
    CREATE POLICY rewards_select_all ON public.rewards FOR SELECT USING (true);
  END IF;
END $$;

-- INSERT: プロが自分のリワードを作成
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rewards' AND policyname = 'rewards_insert_own'
  ) THEN
    CREATE POLICY rewards_insert_own ON public.rewards FOR INSERT
      WITH CHECK (
        professional_id IN (
          SELECT id FROM public.professionals WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- UPDATE: プロが自分のリワードを更新
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rewards' AND policyname = 'rewards_update_own'
  ) THEN
    CREATE POLICY rewards_update_own ON public.rewards FOR UPDATE
      USING (
        professional_id IN (
          SELECT id FROM public.professionals WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- DELETE: プロが自分のリワードを削除
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rewards' AND policyname = 'rewards_delete_own'
  ) THEN
    CREATE POLICY rewards_delete_own ON public.rewards FOR DELETE
      USING (
        professional_id IN (
          SELECT id FROM public.professionals WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
