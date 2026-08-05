-- 045: 育成プルーフ(§2-5・Phase 1.5) — org_members 新カラム3本 + 集計VIEW2本
-- 実行者: CEO(Supabase SQL Editor で手動実行)。CC は実行しない(このファイルは提示のみ)。
--
-- 背景: RP_REFERRAL_IMPL_SPEC.md §2-5 の指示DDLをベースに、新テーブルは作らず既存
--   org_members(招待フロー invited_at/accepted_at/removed_at・バッジ credential_level_id)を
--   そのまま活用する。既存 role(member/manager=権限軸)には触らない。新カラムは
--   「育成カードを表示するか」という別軸(growth_role)として1本追加する。
--
-- ★DEFAULT注意(rp-reference §1の一般原則の例外・CEO決定済み): 通常は新規カラムにDEFAULTを
--   付けない(想定外INSERT混入防止)が、aggregate_opt_in / growth_visibility は
--   「既定ON・取消可」という指示書の意図的なオプトアウト設計(§2-5 実装順5)のため、
--   仕様どおり DEFAULT true / DEFAULT 'public' を付ける。growth_role は null=非表示(通常メンバー)
--   の意味を持つため DEFAULT を付けない。

ALTER TABLE org_members ADD COLUMN IF NOT EXISTS growth_role text;

ALTER TABLE org_members
  ADD CONSTRAINT org_members_growth_role_check
  CHECK (growth_role IS NULL OR growth_role IN ('founder', 'instructor'));

ALTER TABLE org_members ADD COLUMN IF NOT EXISTS aggregate_opt_in boolean DEFAULT true;

ALTER TABLE org_members ADD COLUMN IF NOT EXISTS growth_visibility text DEFAULT 'public';

ALTER TABLE org_members
  ADD CONSTRAINT org_members_growth_visibility_check
  CHECK (growth_visibility IS NULL OR growth_visibility IN ('public', 'private'));

-- 検証(実行後にCEOが確認)
-- SELECT column_name, column_default FROM information_schema.columns
--   WHERE table_name = 'org_members' AND column_name IN ('growth_role','aggregate_opt_in','growth_visibility');
-- SELECT count(*) FROM org_members WHERE growth_role IS NOT NULL;  -- 0(実行直後)

-- ─────────────────────────────────────────────────────────────
-- VIEW: org_growth_summary
-- ─────────────────────────────────────────────────────────────
-- ★指示書§2-5の元案からの修正点(Claude Code調査で判明・この変更はコメントで明記):
--   org_members は professional 1人につきバッジごとに複数行存在する。元案の
--   `and om.growth_role is null` は行単位フィルタのため、代表/講師が持つ「他のバッジ行」
--   (その行だけ見ると growth_role が null)が members CTE に混入し、代表/講師自身の実績が
--   誤って認定者側の分子(member_count/growth_proof_count等)に入ってしまうバグがある。
--   → 行単位ではなく「同一 organization_id + professional_id の行が1つでも growth_role を
--     持っていたら、そのプロを丸ごと除外する」NOT EXISTS に置き換える。
create or replace view org_growth_summary as
with members as (
  select om.organization_id, om.professional_id, min(om.accepted_at) as joined_at
  from org_members om
  where om.status = 'active'
    and om.accepted_at is not null
    and om.removed_at is null
    and coalesce(om.aggregate_opt_in, true) = true
    and coalesce(om.growth_visibility, 'public') = 'public'
    and not exists (
      -- ★修正: 代表/講師自身を「同org・同proの行に growth_role が1つでもあるか」で丸ごと除外
      select 1 from org_members om2
      where om2.organization_id = om.organization_id
        and om2.professional_id = om.professional_id
        and om2.growth_role is not null
    )
  group by om.organization_id, om.professional_id
)
select m.organization_id,
  count(distinct m.professional_id)                                     as member_count,
  count(v.id)                                                           as growth_proof_count,
  count(v.id) filter (where v.created_at > now() - interval '30 days')  as last_30d,
  count(distinct v.normalized_email)                                   as unique_clients
from members m
left join votes v
  on v.professional_id = m.professional_id
  and v.created_at >= m.joined_at        -- 所属確定後の実績のみ計上
  and v.vote_type in ('proof', 'continuation')
group by m.organization_id;

-- ─────────────────────────────────────────────────────────────
-- VIEW: org_growth_proof_top（認定者の強みTOP5用・§2-5「別VIEW」）
-- ─────────────────────────────────────────────────────────────
-- members CTE は org_growth_summary と同じ定義(NOT EXISTS修正込み)。
-- votes は vote_type='proof' AND selected_proof_ids IS NOT NULL に絞ってJOINし、
-- CROSS JOIN LATERAL unnest(selected_proof_ids) で proof_id 別に展開、
-- DISTINCT normalized_email で人数集計する(§2-8のDISTINCT原則に揃える)。
create or replace view org_growth_proof_top as
with members as (
  select om.organization_id, om.professional_id, min(om.accepted_at) as joined_at
  from org_members om
  where om.status = 'active'
    and om.accepted_at is not null
    and om.removed_at is null
    and coalesce(om.aggregate_opt_in, true) = true
    and coalesce(om.growth_visibility, 'public') = 'public'
    and not exists (
      select 1 from org_members om2
      where om2.organization_id = om.organization_id
        and om2.professional_id = om.professional_id
        and om2.growth_role is not null
    )
  group by om.organization_id, om.professional_id
)
select m.organization_id,
  p.proof_id,
  count(distinct v.normalized_email) as client_count
from members m
join votes v
  on v.professional_id = m.professional_id
  and v.created_at >= m.joined_at
  and v.vote_type = 'proof'
  and v.selected_proof_ids is not null
cross join lateral unnest(v.selected_proof_ids) as p(proof_id)
group by m.organization_id, p.proof_id;

-- 巻き戻し(神山事件プロトコル準拠): DROP COLUMN する場合は
--   ① 上記の column_default 確認(growth_roleはDEFAULT無し。aggregate_opt_in/growth_visibilityは
--      DEFAULT付き=意図的な例外のため、DROP前にcolumn_defaultをNULLへ戻す必要はない
--      〈このカラム自体を廃止する場合のみ、まずSET DEFAULT NULLしてから残存行UPDATE→SELECT確認→DROP〉)
--   ② `DROP VIEW IF EXISTS org_growth_proof_top;` → `DROP VIEW IF EXISTS org_growth_summary;`
--      (VIEWはCHECK制約付きカラムに依存しないため、カラムDROP前にVIEW側を先に消す)
--   ③ `ALTER TABLE org_members DROP CONSTRAINT org_members_growth_visibility_check;`
--      → `ALTER TABLE org_members DROP COLUMN growth_visibility;`(growth_role/aggregate_opt_inも同様)
