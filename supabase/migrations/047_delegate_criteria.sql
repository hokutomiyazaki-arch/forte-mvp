-- 047: §16-8 + §16-14 + §16-12 代理案内(停止中プロの公開カードから認定者へ流す導線)
-- 実行者: CEO(Supabase SQL Editor で手動実行)。CC は実行しない(このファイルは提示のみ)。
--
-- 背景: 停止中(accepting_status='closed')のプロの公開カードに、その人が代表(founder)/
-- 指導者(instructor)を務める団体の受付中の認定者を最大4名案内する(§16-8)。
-- §16-14でCEO決定: 絞り込みは「質問ゼロ」。強みは投票実績(vote_summary)から自動算出するため
-- 保存しない。プロ側が保存するのは代理設定の3項目のみ:
--   enabled: 代理案内をON/OFFにするチェックボックス
--   org_id: 代理先団体(founder/instructorを務める団体のいずれか)
--   min_support_records: 実績下限(DISTINCT人数)
--
-- 既存の professionals.delegate_list_id(紹介リスト内の入れ子の代理・§2-2の別機構)は
-- 移行完了まで残す(このカラムには触れない・DROPしない)。

alter table professionals add column if not exists delegate_criteria jsonb;

comment on column professionals.delegate_criteria is
  '§16-8+§16-14: 停止中プロの公開カードで案内する代理候補の抽出設定。'
  '形は { enabled: boolean, org_id: uuid, min_support_records: int } のみ'
  '(強みは自動算出のため保存しない)。DEFAULTは付けない(想定外INSERT混入防止)。';

-- 検証(実行後にCEOが確認):
-- SELECT column_name, column_default, is_nullable FROM information_schema.columns
--   WHERE table_name = 'professionals' AND column_name = 'delegate_criteria';
-- 期待: column_default が NULL であること(DEFAULTを付けていないため)。
