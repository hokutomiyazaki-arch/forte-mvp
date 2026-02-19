-- ============================================
-- 004: クライアントのアカウント完全削除用RPC関数
-- Supabase SQL Editor で実行してください
-- ============================================

-- SECURITY DEFINER: 呼び出し元の権限ではなく、関数作成者の権限で実行
-- auth.uid() で呼び出したユーザー自身のみ削除可能（他人は削除不可）
CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _email text;
BEGIN
  -- ユーザーが認証済みでなければ中断
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- auth.users からメールアドレスを取得
  SELECT email INTO _email FROM auth.users WHERE id = _user_id;

  -- client_rewards を削除（投票時にメールで紐づけている）
  DELETE FROM client_rewards WHERE client_email = _email;

  -- clients テーブルから削除
  DELETE FROM clients WHERE user_id = _user_id;

  -- auth.users から削除（これでGoogleログインでも復活しなくなる）
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;
