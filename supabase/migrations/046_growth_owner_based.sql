-- 046: 育成プルーフ(§2-5) — 代表(founder)判定を organizations.owner_id ベースの自動判定に変更
-- 実行者: CEO(Supabase SQL Editor で手動実行)。CC は実行しない(このファイルは提示のみ)。
--
-- 背景: CEO指示「仕組みとして、自分の団体を作ればそれが表示されるようにしてほしい。
--   毎回手動でお願いするのではない」。代表(founder)の判定を org_members.growth_role='founder'
--   の手動設定依存から organizations.owner_id === professionals.user_id の自動判定へ変更した
--   (アプリ側は src/lib/card-data.ts / src/app/api/org/[org_id]/route.ts で対応済み)。
--
-- このファイルは 045_growth_proof.sql の org_growth_summary / org_growth_proof_top の
-- members CTE に「団体オーナー本人を認定者側の集計(member_count/growth_proof_count等)から
-- 除外する」条件を1つ追加するのみ。他の列・JOIN・既存の growth_role IS NOT NULL 除外は
-- 045 のまま変更しない(CREATE OR REPLACE VIEW で2本とも書き直す)。
--
-- 除外理由: 代表判定を owner_id ベースに統一したため、代表本人が(growth_role未設定の
-- 通常メンバー行として)認定者数に混ざらないようにする。

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
      -- 045由来: 代表/講師自身を「同org・同proの行に growth_role が1つでもあるか」で丸ごと除外
      select 1 from org_members om2
      where om2.organization_id = om.organization_id
        and om2.professional_id = om.professional_id
        and om2.growth_role is not null
    )
    and not exists (
      -- 046追加: 団体オーナー本人(owner_id自動判定の代表)を認定者側から除外
      select 1 from organizations o
      join professionals p on p.user_id = o.owner_id
      where o.id = om.organization_id and p.id = om.professional_id
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
    and not exists (
      -- 046追加: 団体オーナー本人(owner_id自動判定の代表)を認定者側から除外
      select 1 from organizations o
      join professionals p on p.user_id = o.owner_id
      where o.id = om.organization_id and p.id = om.professional_id
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

-- 検証(実行後にCEOが確認):
-- SELECT organization_id, member_count FROM org_growth_summary;
-- 期待: FNT(9b1b653f本人が所属する団体)の member_count に宮崎ほくと自身が含まれないこと
--   (owner_id=宮崎のuser_id かつ professional_id=9b1b653fの行が除外される)。
