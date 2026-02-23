-- リワードリマインドメール送信履歴
CREATE TABLE reward_reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id         UUID NOT NULL REFERENCES votes(id),
  client_email    TEXT NOT NULL,
  reminder_number INT NOT NULL,  -- 1, 2, or 3
  sent_at         TIMESTAMPTZ DEFAULT now(),

  UNIQUE(vote_id, reminder_number)
);

ALTER TABLE reward_reminders ENABLE ROW LEVEL SECURITY;

-- サービスロール（API Route）のみ書き込み。一般ユーザーはアクセス不可
CREATE POLICY "service_only" ON reward_reminders
  FOR ALL USING (false);
