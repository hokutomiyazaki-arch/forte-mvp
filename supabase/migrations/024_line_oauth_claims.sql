-- ============================================================
-- 024: LINE OAuth Callback 冪等性確保テーブル
-- ============================================================
--
-- 目的:
--   LINE 内蔵ブラウザ / Liff の既知挙動で OAuth callback が二重発火し、
--   checkVoteDuplicates → INSERT 間の race condition で 0.04 秒差の
--   二重投票が発生するバグを修正する。
--
-- 仕組み:
--   callback 冒頭で claim_key を INSERT する。claim_key は
--   `{line_user_id}:{professional_id}:{5秒バケット}` の形式。
--   UNIQUE PRIMARY KEY により、同じ 5 秒ウィンドウ内の 2 回目以降の
--   INSERT は 23505 で失敗する。その場合 callback は既存の vote を
--   探して vote-confirmed にリダイレクトする。
--
--   5 秒バケット = Math.floor(Date.now() / 5000) なので、5-10 秒後には
--   別のバケットになり、正当な再投票（7日リピート cooldown 通過後）は
--   ブロックされない。
--
-- 運用:
--   行は削除しない（肥大化しても問題ない規模: LINE 投票/月 x 1行）。
--   必要なら後日 cron で `claimed_at < NOW() - INTERVAL '1 day'` を DELETE。
-- ============================================================

CREATE TABLE IF NOT EXISTS line_oauth_claims (
  claim_key   text PRIMARY KEY,
  claimed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_line_oauth_claims_claimed_at
  ON line_oauth_claims (claimed_at);

-- RLS: サービスロールのみ（callback は supabaseAdmin 経由でアクセス）
ALTER TABLE line_oauth_claims ENABLE ROW LEVEL SECURITY;

-- 匿名クライアントからの書き込みは拒否（サービスロールは RLS バイパスで常に可）
-- ポリシーを明示的に作らなければ anon からはアクセス不能 = 期待通り。
