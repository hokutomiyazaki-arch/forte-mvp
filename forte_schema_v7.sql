-- ============================================
-- FORTE MVP v7 - Database Schema
-- v6からの移行: personality_vote BOOLEAN → personality_categories TEXT[]
--              custom_fortes → custom_result_fortes + custom_personality_fortes
-- Supabase SQL Editor に貼って実行
-- ============================================

-- 既存テーブル削除
DROP VIEW IF EXISTS vote_summary;
DROP VIEW IF EXISTS personality_summary;
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS qr_tokens;
DROP TABLE IF EXISTS clients;
DROP TABLE IF EXISTS professionals;
DROP TABLE IF EXISTS forte_categories;
DROP FUNCTION IF EXISTS update_updated_at();

-- ============================================
-- フォルテカテゴリ（ツリー構造対応）
-- ============================================
CREATE TABLE forte_categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES forte_categories(id),
  category_type TEXT NOT NULL CHECK (category_type IN ('result', 'personality')),
  label TEXT NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0
);

-- 結果フォルテ（デフォルト7項目）
INSERT INTO forte_categories (id, parent_id, category_type, label, description, sort_order) VALUES
  ('pain',          NULL, 'result', '痛みが改善した',             '腰痛、肩こり、膝痛などが減った・なくなった', 1),
  ('movement',      NULL, 'result', '動きが変わった',             '可動域が広がった、身体の使い方が変わった', 2),
  ('posture',       NULL, 'result', '姿勢が変わった',             '姿勢や見た目が改善した', 3),
  ('performance',   NULL, 'result', 'パフォーマンスが上がった',   '競技成績や日常動作が向上した', 4),
  ('chronic',       NULL, 'result', '長年の悩みが解決した',       '他では解決しなかったことが変わった', 5),
  ('maintenance',   NULL, 'result', '予防・メンテナンスに役立つ', '不調が出にくくなった、維持できている', 6),
  ('understanding', NULL, 'result', '身体への理解が深まった',     '自分の身体の仕組みや原因が分かった', 7);

-- 人柄フォルテ（デフォルト7項目）
INSERT INTO forte_categories (id, parent_id, category_type, label, description, sort_order) VALUES
  ('trustworthy',     NULL, 'personality', '安心して任せられる',       '誠実で、身体を預けても大丈夫だと感じた', 1),
  ('approachable',    NULL, 'personality', '話しやすい',               '気軽に相談でき、距離感がちょうどいい', 2),
  ('passionate',      NULL, 'personality', '情熱がある',               '仕事への熱量や向上心を感じた', 3),
  ('attentive',       NULL, 'personality', 'よく見てくれる',           '細かい変化に気づき、一人ひとりに合わせてくれる', 4),
  ('clear_explainer', NULL, 'personality', '説明がわかりやすい',       '専門的なことも噛み砕いて教えてくれる', 5),
  ('good_listener',   NULL, 'personality', '話をしっかり聴いてくれる', '悩みや要望を丁寧に受け止めてくれる', 6),
  ('encouraging',     NULL, 'personality', '前向きにしてくれる',       '励ましやポジティブなエネルギーをもらえた', 7);

-- ============================================
-- プロフェッショナル
-- ============================================
CREATE TABLE professionals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  years_experience INT,
  bio TEXT,
  photo_url TEXT,
  specialties TEXT[],
  booking_url TEXT,
  coupon_text TEXT,
  custom_result_fortes JSONB DEFAULT '[]'::jsonb,
  custom_personality_fortes JSONB DEFAULT '[]'::jsonb,
  is_founding_member BOOLEAN DEFAULT false,
  badges JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- クライアント
-- ============================================
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  nickname TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 時限QRトークン
-- ============================================
CREATE TABLE qr_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID REFERENCES professionals(id) ON DELETE CASCADE NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 投票（2軸：結果フォルテ1つ + 人柄フォルテ複数）
-- ============================================
CREATE TABLE votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID REFERENCES professionals(id) ON DELETE CASCADE NOT NULL,
  client_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  result_category TEXT NOT NULL,
  personality_categories TEXT[] DEFAULT '{}',
  comment TEXT CHECK (char_length(comment) <= 100),
  qr_token TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(professional_id, client_user_id)
);

-- ============================================
-- ビュー：結果フォルテ集計
-- ============================================
CREATE OR REPLACE VIEW vote_summary AS
SELECT 
  professional_id, 
  result_category as category,
  COUNT(*) as vote_count
FROM votes 
GROUP BY professional_id, result_category;

-- ============================================
-- ビュー：人柄フォルテ集計（配列を展開して集計）
-- ============================================
CREATE OR REPLACE VIEW personality_summary AS
SELECT
  professional_id,
  unnest(personality_categories) as category,
  COUNT(*) as vote_count
FROM votes
WHERE array_length(personality_categories, 1) > 0
GROUP BY professional_id, unnest(personality_categories);

-- ============================================
-- インデックス
-- ============================================
CREATE INDEX idx_votes_professional ON votes(professional_id);
CREATE INDEX idx_votes_client ON votes(client_user_id);
CREATE INDEX idx_votes_created ON votes(created_at);
CREATE INDEX idx_votes_result ON votes(result_category);
CREATE INDEX idx_professionals_user ON professionals(user_id);
CREATE INDEX idx_clients_user ON clients(user_id);
CREATE INDEX idx_qr_tokens_token ON qr_tokens(token);
CREATE INDEX idx_qr_tokens_expires ON qr_tokens(expires_at);

-- ============================================
-- RLS (Row Level Security)
-- ============================================
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE forte_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view categories" ON forte_categories FOR SELECT USING (true);
CREATE POLICY "Anyone can view professionals" ON professionals FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON professionals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Auth users can create profile" ON professionals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone can view clients" ON clients FOR SELECT USING (true);
CREATE POLICY "Users can update own client" ON clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Auth users can create client" ON clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone can view votes" ON votes FOR SELECT USING (true);
CREATE POLICY "Auth users can vote" ON votes FOR INSERT WITH CHECK (auth.uid() = client_user_id);
CREATE POLICY "Pro can manage own tokens" ON qr_tokens FOR ALL USING (
  professional_id IN (SELECT id FROM professionals WHERE user_id = auth.uid())
);
CREATE POLICY "Auth users can verify tokens" ON qr_tokens FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================
-- Updated at trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER professionals_updated_at
  BEFORE UPDATE ON professionals FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Storage buckets
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('badges', 'badges', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Auth users can upload avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
CREATE POLICY "Users can update own avatars" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view badges" ON storage.objects FOR SELECT USING (bucket_id = 'badges');
CREATE POLICY "Auth users can upload badges" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'badges' AND auth.role() = 'authenticated');
