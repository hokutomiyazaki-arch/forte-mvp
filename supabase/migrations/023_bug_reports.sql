-- ============================================================
-- 023: Bug Reports テーブル + Storage バケット
-- ============================================================

-- bug_reports テーブル
CREATE TABLE IF NOT EXISTS bug_reports (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  screen      text,                          -- どの画面で
  description text NOT NULL,                 -- 何が起きたか
  email       text,                          -- 連絡先（任意）
  image_url   text,                          -- スクリーンショットURL（任意）
  user_agent  text,                          -- ブラウザ情報
  status      text DEFAULT 'new' NOT NULL,   -- new / in_progress / resolved / wontfix
  created_at  timestamptz DEFAULT now() NOT NULL
);

-- RLS: サービスロールのみアクセス（API Route経由）
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Storage バケット: bug-report-images
INSERT INTO storage.buckets (id, name, public)
VALUES ('bug-report-images', 'bug-report-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: 誰でもアップロード可能（認証不要 — 未ログインユーザーからの報告も受付）
CREATE POLICY "bug-report-images: public upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'bug-report-images');

CREATE POLICY "bug-report-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bug-report-images');
