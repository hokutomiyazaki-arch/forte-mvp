import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { org_id: string } }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const orgId = params.org_id

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle()

    if (orgError) throw orgError
    if (!org) return NextResponse.json({ error: '団体が見つかりません' }, { status: 404 })

    const [orgMembersResult, aggResult] = await Promise.all([
      supabase
        .from('org_members')
        .select('id, professional_id, credential_level_id, status, professionals(id, name, photo_url)')
        .eq('organization_id', orgId)
        .eq('status', 'active'),

      supabase
        .from('org_aggregate')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle(),
    ])

    const allOrgMembers = orgMembersResult.data || []
    const aggregate = aggResult.data

    // 重複排除（同一プロが複数バッジを持つ場合）+ 投票数マージ
    const uniqueMembers = Array.from(
      new Map(allOrgMembers.map((m: any) => [m.professional_id, m])).values()
    )
    const { data: proofSummary } = await supabase
      .from('org_proof_summary')
      .select('professional_id, total_votes')
      .eq('organization_id', orgId)
    const votesMap = new Map((proofSummary || []).map((s: any) => [s.professional_id, Number(s.total_votes) || 0]))
    const members = uniqueMembers
      .map((m: any) => ({ ...m, total_votes: votesMap.get(m.professional_id) || 0 }))
      .sort((a: any, b: any) => b.total_votes - a.total_votes)

    let levelAggregates: any[] = []
    if (org.type === 'credential' || org.type === 'education') {
      const { data: levels } = await supabase
        .from('credential_levels')
        .select('*')
        .eq('organization_id', orgId)
        .order('sort_order', { ascending: true })

      levelAggregates = (levels || []).map((cl: any) => {
        const membersInLevel = allOrgMembers.filter(
          (m: any) => m.credential_level_id === cl.id
        )
        const memberDetails = membersInLevel.map((m: any) => ({
          professional_id: m.professional_id,
          name: m.professionals?.name || '',
          photo_url: m.professionals?.photo_url || null,
        }))
        return {
          level_id: cl.id,
          organization_id: cl.organization_id,
          level_name: cl.name,
          image_url: cl.image_url,
          sort_order: cl.sort_order,
          member_count: membersInLevel.length,
          total_votes: 0,
          members: memberDetails,
        }
      })
    }

    // 一般メンバー取得（professional_idなし・user_idあり・重複なし）
    const { data: generalMembersRaw } = await supabase
      .from('org_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .is('professional_id', null)
      .not('user_id', 'is', null)

    const uniqueUserIds = Array.from(new Set((generalMembersRaw || []).map((m: any) => m.user_id)))

    let generalMembers: any[] = []
    if (uniqueUserIds.length > 0) {
      const { data: clientData } = await supabase
        .from('clients')
        .select('user_id, nickname, photo_url')
        .in('user_id', uniqueUserIds)
      generalMembers = (clientData || []).map((c: any) => ({
        user_id: c.user_id,
        display_name: c.nickname || '一般会員',
        photo_url: c.photo_url || null,
      }))
    }

    return NextResponse.json({ org, members, aggregate, levelAggregates, general_count: uniqueUserIds.length, generals: generalMembers })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
