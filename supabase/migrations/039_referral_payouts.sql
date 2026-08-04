-- 039: 送り手分配の台帳（referral_payouts）
-- 実行者: CEO（Supabase SQL Editor で手動実行）。CC は実行しない。
--
-- 背景: 紹介案件が完了（受け手のPATCH complete / cronの自動完了）した時点で、
--   status='completed'・sender_pro_id が設定され payment_status='paid' の案件のみ、
--   送り手への分配額を1回だけ確定させる台帳。
--   レビュー指摘(重大1・指示書§2-4修正): 分配額は「予約金(collectしたfee)の30%」ではなく
--   ★セッション価格(price_jpy)そのものに対する fee_sender_bps(予約ごとに固定・遡及禁止)。
--   例: 価格10,000円・fee_sender_bps=3000(30%) → 送り手3,000円
--   （予約金は10,000*33.6%=3,360円で、うち送り手3,000円・決済実費(Stripe)360円・リアプル取り分0円）。
--   支払いはStripe Connect導入までの間、当面 CEO が手動で行う（status を
--   'pending'→'paid' に更新するのはSQL、実行はCEO。アプリからはINSERT/SELECTのみ）。
--   booking_id を UNIQUE にすることで、完了処理が複数経路（受け手PATCH・cron）や
--   再実行から呼ばれても分配行は1回しか作られない（23505衝突は「作成済み」として
--   アプリ側で成功扱いにする＝冪等性はDB制約側で担保）。
--
-- 運用手順(中5): 完了後にプロ都合等でCEOが手動返金した場合、該当 booking_id の
--   referral_payouts.status を 'cancelled' に更新する（送り手への支払い対象から外す。
--   実行はCEOがSupabase SQL Editorで。例:
--     UPDATE referral_payouts SET status='cancelled', note='手動返金のため取消' WHERE booking_id='<UUID>';）
--
-- 運用手順(ステージ4「自動送金」レビュー指摘・重大1・2026-08-05追記): status='paid'（=Stripe
--   transfers.create で送り手のConnectアカウントへ実際に送金済み）の行を後から取り消す場合、
--   このUPDATEだけでは送金済みの資金は戻らない。Stripe側で
--   `stripe.transfers.createReversal(<transfer_id>)`（transfer_idはこのテーブルのnoteカラムに
--   記録済み）を実行して初めて資金が戻る。status更新（'cancelled'化）は台帳上の記録に過ぎず、
--   reversal実行とは別の手動操作として必ず両方行うこと（片方だけだと「DB上は取消済みなのに
--   実際は送金されたまま」という不整合が残る）。
--
-- 安全性: 新規テーブル追加のみ（既存テーブルへの変更なし）。新規カラムに
--   DEFAULT値は付けない方針だが、status は運用管理カラム（036/031と同じ流儀で
--   CHECK制約は付けずコード側で値を管理）としてのみ 'pending' を初期値にする。
-- 巻き戻し方法: DROP TABLE referral_payouts;（他テーブルへの影響なし・FKはこのテーブル
--   からの参照のみのため、DROP前のCOUNT確認以外の追加手順は不要）
--
-- RLS: 既存のリフェラル関連テーブル（referral_invites/booking_messages 等・031/036参照）と
--   同様にRLSは有効化しない（本DBはservice_role経由のみでアクセスする運用のため）。

CREATE TABLE IF NOT EXISTS referral_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid UNIQUE NOT NULL REFERENCES referral_bookings(id),
  sender_pro_id uuid NOT NULL REFERENCES professionals(id),
  receiver_pro_id uuid NOT NULL REFERENCES professionals(id),
  amount_jpy integer NOT NULL,
  fee_amount_jpy integer NOT NULL, -- Stripeで実際にcollectした予約金の総額(price_jpy*fee_total_bps/10000)。監査用(amount_jpyの算出元ではない・amount_jpyはprice_jpy*fee_sender_bps/10000)
  status text NOT NULL DEFAULT 'pending', -- 'pending'(確定済み・未払い)|'paid'(支払済み・当面SQLで手動更新)|'cancelled'（CHECKは付けず運用管理=036/031と同流儀）
  created_at timestamptz DEFAULT now(),
  paid_at timestamptz,
  note text
);

CREATE INDEX IF NOT EXISTS idx_referral_payouts_sender ON referral_payouts (sender_pro_id, status);
CREATE INDEX IF NOT EXISTS idx_referral_payouts_status ON referral_payouts (status);

-- 検証
-- SELECT COUNT(*) FROM referral_payouts;  -- 0
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'referral_payouts';
