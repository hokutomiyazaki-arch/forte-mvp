-- Phase 1 DDL の記録（レビュー指摘・中10）＋ 予約リクエストの重複防止 UNIQUE（レビュー指摘・中7）
-- 実行者: CEO（Supabase SQL Editor で手動実行）。CC は実行しない。

-- ============================================================
-- PART A【記録のみ・実行済み】Phase 1 で 2026-08-01 に実行済みの DDL の単一情報源
-- （実行済みのため再実行不要。IF NOT EXISTS で冪等）
-- ============================================================

CREATE TABLE IF NOT EXISTS referral_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  title text NOT NULL,
  comment text,
  visibility text NOT NULL DEFAULT 'link' CHECK (visibility IN ('link','private','public')),
  criteria jsonb,
  slug text UNIQUE,
  is_delegate boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referral_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES referral_lists(id) ON DELETE CASCADE,
  pro_id uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  note text,
  sort_order int DEFAULT 0,
  consent_status text NOT NULL DEFAULT 'pending' CHECK (consent_status IN ('pending','approved','declined')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (list_id, pro_id)
);

ALTER TABLE professionals ADD COLUMN IF NOT EXISTS accepting_status text DEFAULT 'closed'
  CHECK (accepting_status IN ('open','conditional','closed'));
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS accepting_note text;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS accepting_updated_at timestamptz;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS delegate_list_id uuid REFERENCES referral_lists(id);

ALTER TABLE pro_menus ADD COLUMN IF NOT EXISTS price_jpy int;
ALTER TABLE pro_menus ADD COLUMN IF NOT EXISTS duration_min int;
ALTER TABLE pro_menus ADD COLUMN IF NOT EXISTS is_referral_bookable boolean DEFAULT false;
ALTER TABLE pro_menus ADD COLUMN IF NOT EXISTS external_price_url text;

CREATE TABLE IF NOT EXISTS referral_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid REFERENCES referral_lists(id),
  sender_pro_id uuid REFERENCES professionals(id),
  receiver_pro_id uuid NOT NULL REFERENCES professionals(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  menu_id uuid REFERENCES pro_menus(id),
  theme_tags text[],
  preferred_slots jsonb,
  confirmed_at timestamptz,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','confirmed','completed','cancelled','expired')),
  price_jpy int NOT NULL,
  fee_total_bps int NOT NULL DEFAULT 4000,
  fee_sender_bps int NOT NULL DEFAULT 2800,
  fee_platform_bps int NOT NULL DEFAULT 1200,
  stripe_payment_intent_id text,
  info_share_consent boolean DEFAULT false,
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- PART B【未実行・要実行】予約リクエストの二重送信防止（部分UNIQUE・レビュー指摘 中7）
-- 同一クライアント→同一受け手の requested は同時に1件まで（確定/失効後は再申込可）
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uniq_referral_bookings_requested
  ON referral_bookings (client_id, receiver_pro_id)
  WHERE status = 'requested';

-- STEP 検証:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'referral_bookings';
