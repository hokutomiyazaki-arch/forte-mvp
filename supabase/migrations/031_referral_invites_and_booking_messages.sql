-- §2-9 外部プロの招待 / §2-10 案件スレッド のスキーマ追加（Phase 1）
-- 実行者: CEO（Supabase SQL Editor で手動実行）。CC は実行しない。
-- 実行順: 上から順に。全て新規追加のみ（既存データへの影響なし・DEFAULTは仕様上必要な箇所のみ）

-- STEP 1【§2-10】案件スレッド: 予約に紐づくプロ間コメント（送り手・受け手のみ。クライアント閲覧不可）
CREATE TABLE IF NOT EXISTS booking_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES referral_bookings(id) ON DELETE CASCADE,
  sender_pro_id uuid NOT NULL REFERENCES professionals(id),
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_booking_messages_booking ON booking_messages (booking_id, created_at);

-- STEP 2【§2-10】引き継ぎメモ（構造化・送り手が記入。クライアントの情報共有同意=§2-4④に紐づくレイヤー1）
-- 想定構造: { "theme": "", "history": "", "tried": "", "notes": "" }
ALTER TABLE referral_bookings ADD COLUMN IF NOT EXISTS handover_note jsonb;

-- STEP 3【§2-9】外部プロの招待（処方箋リスト経由・報酬なし・未登録保留は1人10件まで＝アプリ側で制御）
CREATE TABLE IF NOT EXISTS referral_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES referral_lists(id) ON DELETE CASCADE,
  inviter_pro_id uuid NOT NULL REFERENCES professionals(id),
  invitee_name text NOT NULL,
  invite_token text UNIQUE NOT NULL,
  registered_pro_id uuid REFERENCES professionals(id),
  created_at timestamptz DEFAULT now(),
  registered_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_referral_invites_inviter ON referral_invites (inviter_pro_id);

-- STEP 4【検証】
-- SELECT COUNT(*) FROM booking_messages;   -- 0
-- SELECT COUNT(*) FROM referral_invites;   -- 0
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'referral_bookings' AND column_name = 'handover_note';  -- 1行
