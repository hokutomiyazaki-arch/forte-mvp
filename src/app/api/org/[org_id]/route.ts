import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { org_id: string } }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        global: {
          fetch: (url, options = {}) =>
            fetch(url, { ...options, cache: 'no-store' }),
        },
      }
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
      .select('id, professional_id, credential_level_id, status, professionals(id, name, photo_url, title)')
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

    // 重複排除（同一プロが複数バッジを持つ場合）+ 投票数を直接votesテーブルから取得
    const uniqueMembers = Array.from(
      new Map(allOrgMembers.map((m: any) => [m.professional_id, m])).values()
    )

    // org_proof_summary VIEWの代わりにvotesテーブルから直接集計（Vercelキャッシュ問題回避）
    let votesMap = new Map<string, number>()
    if (professionalIds.length > 0) {
      const { data: votesPerPro } = await supabase
        .from('votes')
        .select('professional_id')
        .in('professional_id', professionalIds)
      const countMap: Record<string, number> = {}
      for (const v of votesPerPro || []) {
        countMap[v.professional_id] = (countMap[v.professional_id] || 0) + 1
      }
      votesMap = new Map(Object.entries(countMap))
    }

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

      // 各credential_levelごとにorg_membersから直接取得（VIEWキャッシュ回避）
      const levelIds = (levels || []).map((cl: any) => cl.id)
      const { data: levelMembersRaw } = await supabase
        .from('org_members')
        .select('professional_id, user_id, credential_level_id, professionals(id, name, photo_url)')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .not('credential_level_id', 'is', null)
        .in('credential_level_id', levelIds)

      // 一般会員のuser_idsを収集してclientsから名前・写真を取得
      const generalUserIdsInLevels = (levelMembersRaw || [])
        .filter((m: any) => !m.professional_id && m.user_id)
        .map((m: any) => m.user_id)
      const uniqueGeneralUserIds = Array.from(new Set(generalUserIdsInLevels))

      let levelClientMap = new Map<string, any>()
      if (uniqueGeneralUserIds.length > 0) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('user_id, nickname, photo_url')
          .in('user_id', uniqueGeneralUserIds)
        for (const c of (clientData || [])) {
          levelClientMap.set(c.user_id, c)
        }
      }

      // credential_level_id別にグループ化（プロ+一般の両方を含める）
      const membersByLevelId = new Map<string, Map<string, any>>()
      for (const m of levelMembersRaw || []) {
        if (!m.credential_level_id) continue  // credential_level_idなしはスキップ（バッジなし）
        // キーはprofessional_id（プロ）またはuser_id（一般）
        const memberKey = m.professional_id || m.user_id
        if (!memberKey) continue  // 両方NULLは無視
        if (!membersByLevelId.has(m.credential_level_id)) {
          membersByLevelId.set(m.credential_level_id, new Map())
        }
        const levelMap = membersByLevelId.get(m.credential_level_id)!
        if (!levelMap.has(memberKey)) {
          levelMap.set(memberKey, m)
        }
      }

      levelAggregates = (levels || []).map((cl: any) => {
        const levelMap = membersByLevelId.get(cl.id)
        const membersInLevel = levelMap ? Array.from(levelMap.values()) : []
        const memberDetails = membersInLevel.map((m: any) => {
          if (m.professional_id) {
            // プロ会員
            return {
              professional_id: m.professional_id,
              user_id: null,
              is_pro: true,
              name: m.professionals?.name || '',
              photo_url: m.professionals?.photo_url || null,
            }
          } else {
            // 一般会員
            const client = m.user_id ? levelClientMap.get(m.user_id) : null
            return {
              professional_id: null,
              user_id: m.user_id,
              is_pro: false,
              name: client?.nickname || '一般会員',
              photo_url: client?.photo_url || null,
            }
          }
        })
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

    // プルーフ別トップメンバー集計（professionalIdsを直接使用、org_members JOINを排除）
    let proofTopMembers: any[] = []
    let topStrengthItems: { label: string; count: number }[] = []

    if (professionalIds.length > 0) {
      // メンバーの投票でselected_proof_idsがある投票を取得（professionalIdsから直接）
      const { data: votesWithProofs } = await supabase
        .from('votes')
        .select('professional_id, selected_proof_ids')
        .in('professional_id', professionalIds)
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

          // プロ情報マップ（allOrgMembersから構築、professionalIds全員をカバー）
          const proMap = new Map<string, { name: string; photo_url: string | null }>()
          for (const m of allOrgMembers) {
            if (m.professional_id && !proMap.has(m.professional_id)) {
              const pro = m.professionals as any
              proMap.set(m.professional_id, {
                name: pro?.name || '',
                photo_url: pro?.photo_url || null,
              })
            }
          }

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

    // 最新コメント取得（professional_idベースで直接、org_members JOINなし）
    let recentComments: any[] = []
    if (professionalIds.length > 0) {
      const { data: commentsRaw } = await supabase
        .from('votes')
        .select('comment, professional_id, created_at')
        .in('professional_id', professionalIds)
        .not('comment', 'is', null)
        .neq('comment', '')
        .order('created_at', { ascending: false })
        .limit(4)

      if (commentsRaw && commentsRaw.length > 0) {
        // プロ情報マップ（allOrgMembersから構築済みのデータを再利用）
        const commentProMap = new Map<string, string>()
        for (const m of allOrgMembers) {
          if (m.professional_id && !commentProMap.has(m.professional_id)) {
            const pro = m.professionals as any
            commentProMap.set(m.professional_id, pro?.name || '')
          }
        }

        recentComments = commentsRaw.map((c: any) => ({
          comment: c.comment,
          professional_name: commentProMap.get(c.professional_id) || '',
          professional_id: c.professional_id,
          created_at: c.created_at,
        }))
      }
    }

    // メンバー判定 + リソース取得（ログイン済みユーザーのみ）
    let isMember = false
    let memberResources: any[] = []
    try {
      const { userId } = await auth()
      if (userId) {
        // プロ会員としてのprofessional_idを取得
        const { data: proData } = await supabase
          .from('professionals')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle()
        const myProId = proData?.id || null

        // org_membersでメンバーかチェック（プロ or 一般）
        let memberLevelIds: string[] = []

        if (myProId) {
          const { data: proMemberships } = await supabase
            .from('org_members')
            .select('credential_level_id')
            .eq('organization_id', orgId)
            .eq('professional_id', myProId)
            .eq('status', 'active')
          if (proMemberships && proMemberships.length > 0) {
            isMember = true
            memberLevelIds = proMemberships
              .map((m: any) => m.credential_level_id)
              .filter(Boolean)
          }
        }

        if (!isMember) {
          const { data: generalMemberships } = await supabase
            .from('org_members')
            .select('credential_level_id')
            .eq('organization_id', orgId)
            .eq('user_id', userId)
            .is('professional_id', null)
            .eq('status', 'active')
          if (generalMemberships && generalMemberships.length > 0) {
            isMember = true
            memberLevelIds = generalMemberships
              .map((m: any) => m.credential_level_id)
              .filter(Boolean)
          }
        }

        // メンバーならリソースを取得
        if (isMember) {
          const { data: resourcesRaw } = await supabase
            .from('org_resources')
            .select('id, title, url, description, credential_level_id, sort_order')
            .eq('organization_id', orgId)
            .order('sort_order', { ascending: true })

          // credential_level_id が NULL（全員向け）または本人のバッジIDに一致するものだけ
          memberResources = (resourcesRaw || []).filter((r: any) => {
            if (!r.credential_level_id) return true // 全員向け
            return memberLevelIds.includes(r.credential_level_id)
          })

          // credential_level名を付与
          if (memberResources.length > 0) {
            const resLevelIds = memberResources
              .map((r: any) => r.credential_level_id)
              .filter(Boolean)
            const uniqueResLevelIds = Array.from(new Set(resLevelIds))
            let resLevelMap = new Map<string, string>()
            if (uniqueResLevelIds.length > 0) {
              const { data: resLevels } = await supabase
                .from('credential_levels')
                .select('id, name, image_url')
                .in('id', uniqueResLevelIds)
              for (const lv of (resLevels || [])) {
                resLevelMap.set(lv.id, lv.name)
              }
            }
            memberResources = memberResources.map((r: any) => ({
              ...r,
              level_name: r.credential_level_id ? resLevelMap.get(r.credential_level_id) || null : null,
            }))
          }
        }
      }
    } catch {
      // auth() 失敗は無視（未ログインユーザー）
    }

    return NextResponse.json({ org, members, aggregate, levelAggregates, general_count: uniqueUserIds.length, generals: generalMembers, proofTopMembers, topStrengthItems, recentComments, is_member: isMember, resources: memberResources })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
