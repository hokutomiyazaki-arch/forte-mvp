-- ============================================================
-- Migration 050: 相談フォームの「受信許可の記録」と「アーカイブ」
-- ============================================================
--
-- 背景（CEO指示・2026-08-06）
--   ① 送信時の同意文を「プロに教えることへの同意」から
--      「REAL PROOF からのメッセージ受信を許可する」というオプトインに変える。
--      オプトインは**いつ許可したかを残せないと意味がない**ので、記録用のカラムを足す。
--   ② 相談スレッドをダッシュボードから隠せるようにする（アーカイブ）。
--
-- ② は既存の status に 'archived' を足すだけで済ませる（新カラムを作らない）。
--    ただし status に CHECK 制約が付いているかは未確認だったため、下で確認してから
--    必要なら作り直す。制約が無ければ何もしなくてよい。
--
-- ⚠️ コード側は**このカラムが無くても動く**（fail-soft）。
--    consent_at を含む INSERT が失敗したらキーを外して再試行する実装にしてある
--    （gallery_image_urls 等と同じやり方）。なので実行は必須ではないが、
--    実行するまで「いつ許可したか」の記録は残らない。
-- ============================================================

-- ── ① 受信許可の記録 ──────────────────────────────────
-- NULL = 記録なし（このカラムを作る前に届いた相談）。
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS consent_at timestamptz;

COMMENT ON COLUMN consultations.consent_at IS
  'クライアントが「REAL PROOFからのメッセージ受信」を許可した日時。オプトインの証跡。';

-- ── ② アーカイブ: status に 'archived' が入るかを先に確認する ──────
-- CHECK制約が無ければ、この SELECT は 0 行を返す（＝そのまま 'archived' を使えるので
-- 以降は何もしなくてよい）。
--
-- SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
-- FROM pg_constraint con
-- JOIN pg_class rel ON rel.oid = con.conrelid
-- WHERE rel.relname = 'consultations' AND con.contype = 'c';
--
-- 上で status を縛る CHECK が出てきた場合だけ、名前を読み替えて張り替える:
--
-- ALTER TABLE consultations DROP CONSTRAINT <出てきた制約名>;
-- ALTER TABLE consultations ADD CONSTRAINT consultations_status_check
--   CHECK (status IN ('new', 'open', 'closed', 'archived'));

-- ── 検証 ────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'consultations' AND column_name = 'consent_at';
