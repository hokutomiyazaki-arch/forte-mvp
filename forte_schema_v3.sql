-- ============================================
-- FORTE MVP - Database Schema v3
-- ※ 既存テーブルを削除して再作成します
-- Supabase SQL Editor に貼って実行
-- ============================================

DROP VIEW IF EXISTS vote_summary;
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS professionals;
DROP FUNCTION IF EXISTS update_updated_at();

CREATE TABLE professionals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  years_experience INT,
  bio TEXT,
  photo_url TEXT,
  specialties TEXT[],
  booking_url TEXT,
  coupon_text TEXT,
  selected_fortes TEXT[],
  custom_forte_1 TEXT,
  custom_forte_2 TEXT,
  is_founding_member BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID REFERENCES professionals(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  comment TEXT,
  voter_fingerprint TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE VIEW vote_summary AS
SELECT professional_id, category, COUNT(*) as vote_count
FROM votes GROUP BY professional_id, category;

CREATE INDEX idx_votes_professional ON votes(professional_id);
CREATE INDEX idx_votes_created ON votes(created_at);
CREATE INDEX idx_professionals_user ON professionals(user_id);

ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view professionals" ON professionals FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON professionals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can create profile" ON professionals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone can view votes" ON votes FOR SELECT USING (true);
CREATE POLICY "Anyone can vote" ON votes FOR INSERT WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER professionals_updated_at
  BEFORE UPDATE ON professionals FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Storage: avatars bucket
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Authenticated users can upload avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
CREATE POLICY "Users can update own avatars" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
