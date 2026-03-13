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

    const { data: orgMembersData } = await supabase
      .from('org_members')
      .select('id, professional_id, credential_level_id, status, professionals(id, name, photo_url)')
      .eq('organization_id', orgId)
      .eq('status', 'active')

    const allOrgMembers = orgMembersData || []

    // org_aggregate VIEWの代わりに直接計算（Vercelキャッシュ問題回避）
    const { data: memberCountData } = await supabase
      .from('org_members')
      .select('professional_id')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .not('professional_id', 'is', null)

    const uniqueProIds = new Set((memberCountData || []).map((m: any) => m.professional_id))
    const professionalIds = Array.from(uniqueProIds)

    let totalVotes = 0
    let recentVotes = 0
    if (professionalIds.length > 0) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const [totalResult, recentResult] = await Promise.all([
        supabase
          .from('votes')
          .select('id', { count: 'exact', head: true })
          .in('professional_id', professionalIds),
        supabase
          .from('votes')
          .select('id', { count: 'exact', head: true })
          .in('professional_id', professionalIds)
          .gte('created_at', thirtyDaysAgo),
      ])
      totalVotes = totalResult.count || 0
      recentVotes = recentResult.count || 0
    }

    const aggregate = {
      active_member_count: uniqueProIds.size,
      total_org_votes: totalVotes,
      votes_last_30_days: recentVotes,
    }

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

      // credential_level_id別にorg_membersをグループ化（nullは除外）
      const membersByLevelId = new Map<string, any[]>()
      for (const m of allOrgMembers) {
        if (m.credential_level_id) {
          const arr = membersByLevelId.get(m.credential_level_id) || []
          arr.push(m)
          membersByLevelId.set(m.credential_level_id, arr)
        }
      }

      levelAggregates = (levels || []).map((cl: any) => {
        const membersInLevel = membersByLevelId.get(cl.id) || []
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

    // プルーフ別トップメンバー集計
    const memberProIds = uniqueMembers
      .map((m: any) => m.professional_id)
      .filter(Boolean)
    let proofTopMembers: any[] = []
    let topStrengthItems: { label: string; count: number }[] = []

    if (memberProIds.length > 0) {
      // メンバーの投票でselected_proof_idsがある投票を取得
      const { data: votesWithProofs } = await supabase
        .from('votes')
        .select('professional_id, selected_proof_ids')
        .in('professional_id', memberProIds)
        .not('selected_proof_ids', 'is', null)

      if (votesWithProofs && votesWithProofs.length > 0) {
        // proof_item_id ごと × professional_id ごとの集計
        const proofProMap: Record<string, Record<string, number>> = {}
        const proofTotalMap: Record<string, number> = {}

        for (const v of votesWithProofs) {
          const proofIds: string[] = v.selected_proof_ids || []
          for (const pid of proofIds) {
            if (!proofProMap[pid]) proofProMap[pid] = {}
            proofProMap[pid][v.professional_id] = (proofProMap[pid][v.professional_id] || 0) + 1
            proofTotalMap[pid] = (proofTotalMap[pid] || 0) + 1
          }
        }

        // proof_itemsのラベルを取得
        const proofItemIds = Object.keys(proofProMap)
        if (proofItemIds.length > 0) {
          const { data: proofItems } = await supabase
            .from('proof_items')
            .select('id, label')
            .in('id', proofItemIds)

          const labelMap = new Map((proofItems || []).map((p: any) => [p.id, p.label]))

          // プロ情報マップ
          const proMap = new Map(
            uniqueMembers.map((m: any) => [
              m.professional_id,
              { name: m.professionals?.name || '', photo_url: m.professionals?.photo_url || null },
            ])
          )

          // 各proof_itemでトップのprofessionalを特定
          const rankings = proofItemIds
            .map(proofId => {
              const proCounts = proofProMap[proofId]
              let topProId = ''
              let topCount = 0
              for (const [proId, count] of Object.entries(proCounts)) {
                if (count > topCount) {
                  topProId = proId
                  topCount = count
                }
              }
              const proInfo = proMap.get(topProId)
              return {
                proof_label: labelMap.get(proofId) || '',
                top_professional_id: topProId,
                top_name: proInfo?.name || '',
                top_photo_url: proInfo?.photo_url || null,
                vote_count: topCount,
                total_voters: proofTotalMap[proofId] || 0,
              }
            })
            .filter(r => r.proof_label)
            .sort((a, b) => b.total_voters - a.total_voters)
            .slice(0, 10)

          proofTopMembers = rankings

          // 個別強みランキング（proof_item_id別、label使用、TOP5）
          topStrengthItems = proofItemIds
            .map(proofId => ({
              label: labelMap.get(proofId) || '',
              count: proofTotalMap[proofId] || 0,
            }))
            .filter(item => item.label)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
        }
      }
    }

    return NextResponse.json({ org, members, aggregate, levelAggregates, general_count: uniqueUserIds.length, generals: generalMembers, proofTopMembers, topStrengthItems })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
