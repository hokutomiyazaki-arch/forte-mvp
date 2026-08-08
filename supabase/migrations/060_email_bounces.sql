-- ============================================================
-- 060: バウンスしたメールアドレスの永続記録（CEO報告 2026-08-08）
--
-- 症状: 紹介予約でわざと間違いアドレスを入れても「メール届かず」の印が出ない。
-- 真因: Resend は一度バウンスしたアドレスを抑制リストに入れ、以後は送信も bounce webhook も
-- 発生させない。一方こちらの既知不達チェック(isKnownUndeliverableEmail)は
-- referral_bookings / consultations の行に付いた印だけを見る作りのため、
-- **テストや削除で該当行が消えると「知らないアドレス」に戻り、二度と検知できなくなる**。
--
-- 対策: bounce webhook 受信時にアドレスを専用テーブルへ永続記録し、
-- 予約・相談の作成時チェックがまずここを見る。行の削除に影響されない。
--
-- コード側(先行デプロイ済み・fail-soft):
--   - src/app/api/webhooks/resend/route.ts が INSERT（テーブル未作成でも本処理は落ちない）
--   - src/lib/booking-email-fix.ts の isKnownUndeliverableEmail が最初に参照
-- ============================================================

CREATE TABLE IF NOT EXISTS email_bounces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  normalized_email text NOT NULL,
  -- どの種類のメールでバウンスしたか（'booking_receipt' 等・デバッグ用の自由記述）
  source text,
  bounced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_bounces_normalized_email ON email_bounces (normalized_email);

-- PII(メールアドレス)を含むため、service_role 以外からの読み書きを封じる
-- （RLS有効化＋ポリシー無し = anon/authenticated は一切アクセス不可。service_role はRLSを常にバイパス）
ALTER TABLE email_bounces ENABLE ROW LEVEL SECURITY;

-- 実行後の検証:
--   SELECT count(*) FROM email_bounces;  -- 0行で正常（webhook受信後に増えていく）
