import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/org-dashboard
 * orgダッシュボードに必要な全データをサーバー側で一括取得。
 * N+1問題（ERR_INSUFFICIENT_RESOURCES）の解消。
 * メンバー管理はバッジベース（org_membersのcredential_level_id付きレコード）。
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    // 1. このユーザーがオーナーの団体を取得
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (orgError) throw orgError
    if (!org) {
      return NextResponse.json({ org: null })
    }

    // 2. 全データを並列取得（holdersクエリも含めて同時実行）
    const [
      membersResult,
      aggregateResult,
      badgesResult,
      holdersResult,
    ] = await Promise.all([
      // メンバー + プルーフ数（org_proof_summary ビュー）
      supabase
        .from('org_proof_summary')
        .select('*')
        .eq('organization_id', org.id)
        .order('total_votes', { ascending: false }),

      // 団体全体の集計（org_aggregate ビュー）
      supabase
        .from('org_aggregate')
        .select('*')
        .eq('organization_id', org.id)
        .maybeSingle(),

      // バッジ一覧（credential_levels）
      supabase
        .from('credential_levels')
        .select('*')
        .eq('organization_id', org.id)
        .order('sort_order', { ascending: true }),

      // バッジ取得者一括取得（org_members + professional + credential_level）
      supabase
        .from('org_members')
        .select('id, user_id, credential_level_id, professional_id, accepted_at, professionals(id, name, photo_url, title), credential_levels(id, name, image_url)')
        .eq('organization_id', org.id)
        .eq('status', 'active')
        .not('credential_level_id', 'is', null),
    ])

    // 3. バッジ・ホルダー集計
    const badges = badgesResult.data || []
    const badgeHolders = holdersResult.data || []

    // professional_idがNULLのメンバーのuser_idを収集してclientsテーブルから一括取得
    const generalUserIds = badgeHolders
      .filter((h: any) => !h.professional_id && h.user_id)
      .map((h: any) => h.user_id)
    let clientMap = new Map<string, any>()
    if (generalUserIds.length > 0) {
      const { data: clientData } = await supabase
        .from('clients')
        .select('user_id, nickname, photo_url')
        .in('user_id', generalUserIds)
      for (const c of (clientData || [])) {
        clientMap.set(c.user_id, c)
      }
    }

    const badgeHolderCounts: Record<string, number> = {}
    for (const h of badgeHolders) {
      if (h.credential_level_id) {
        badgeHolderCounts[h.credential_level_id] = (badgeHolderCounts[h.credential_level_id] || 0) + 1
      }
    }

    // バッジホルダーから一意メンバーリスト（同じプロが複数バッジを持つ場合は重複排除）
    const memberMap = new Map<string, any>()
    for (const h of badgeHolders) {
      const pro = h.professionals as any
      const cl = h.credential_levels as any
      if (pro && !memberMap.has(h.professional_id)) {
        memberMap.set(h.professional_id, {
          professional_id: h.professional_id,
          name: pro.name,
          photo_url: pro.photo_url,
          title: pro.title,
          badge_name: cl?.name,
          accepted_at: h.accepted_at,
        })
      }
    }
    const uniqueMembers = Array.from(memberMap.values())

    // 4. メンバーリスト統合: org_proof_summary を基本にして、バッジ情報を追加する方式
    // org_proof_summary の total_votes を正として lookup map を構築
    const proofMembers = membersResult.data || []
    const proofVotesMap = new Map<string, number>()
    for (const m of proofMembers) {
      proofVotesMap.set(m.professional_id, Number(m.total_votes) || 0)
    }
    const proofMemberIds = new Set(proofMembers.map((m: any) => m.professional_id))

    // proofMembers を基本に、バッジ取得者のうち未含有の人を追加
    // total_votes は常に proofVotesMap から取得（上書き防止）
    const mergedMembers = [
      ...proofMembers.map((m: any) => ({
        ...m,
        total_votes: Number(m.total_votes) || 0,
      })),
      ...uniqueMembers
        .filter(m => !proofMemberIds.has(m.professional_id))
        .map(m => ({
          professional_id: m.professional_id,
          professional_name: m.name,
          photo_url: m.photo_url,
          title: m.title,
          total_votes: proofVotesMap.get(m.professional_id) || 0,
          organization_id: org.id,
        })),
    ].sort((a: any, b: any) => (Number(b.total_votes) || 0) - (Number(a.total_votes) || 0))

    // 5. メンバーの強みデータ取得（投票内訳 + proof_itemsマスタ）
    const allProIds = mergedMembers.map((m: any) => m.professional_id).filter(Boolean)
    let strengthDistribution: { tab: string; count: number }[] = []
    let topStrengthItems: { label: string; count: number }[] = []

    if (allProIds.length > 0) {
      const [{ data: votesRaw }, { data: proofItems }] = await Promise.all([
        supabase
          .from('votes')
          .select('professional_id, selected_proof_ids')
          .in('professional_id', allProIds)
          .not('selected_proof_ids', 'is', null),
        supabase
          .from('proof_items')
          .select('id, label, strength_label, tab'),
      ])

      const piMap = new Map<string, { label: string; strength_label: string; tab: string }>()
      for (const pi of proofItems || []) {
        piMap.set(pi.id, { label: pi.label || '', strength_label: pi.strength_label || '', tab: pi.tab || '' })
      }

      // professional_id別 × proof_item_id別の集計
      const proStrengthMap = new Map<string, Map<string, number>>()
      const tabTotalMap: Record<string, number> = {}
      const proofItemCountMap: Record<string, number> = {}

      for (const v of votesRaw || []) {
        const pids: string[] = v.selected_proof_ids || []
        for (const pid of pids) {
          // メンバー別集計
          if (!proStrengthMap.has(v.professional_id)) {
            proStrengthMap.set(v.professional_id, new Map())
          }
          const pMap = proStrengthMap.get(v.professional_id)!
          pMap.set(pid, (pMap.get(pid) || 0) + 1)

          // タブ別集計（強み分布チャート用）
          const piInfo = piMap.get(pid)
          if (piInfo?.tab) {
            tabTotalMap[piInfo.tab] = (tabTotalMap[piInfo.tab] || 0) + 1
          }

          // proof_item_id別集計（個別強みランキング用）
          proofItemCountMap[pid] = (proofItemCountMap[pid] || 0) + 1
        }
      }

      // 各メンバーに top_strength を追加
      for (const m of mergedMembers) {
        const pMap = proStrengthMap.get(m.professional_id)
        if (pMap && pMap.size > 0) {
          let topPid = ''
          let topCount = 0
          Array.from(pMap.entries()).forEach(([pid, count]) => {
            if (count > topCount) {
              topPid = pid
              topCount = count
            }
          })
          const piInfo = piMap.get(topPid)
          m.top_strength = piInfo?.strength_label || ''
        } else {
          m.top_strength = ''
        }
      }

      // 強み分布（tab別）
      strengthDistribution = Object.entries(tabTotalMap)
        .map(([tab, count]) => ({ tab, count }))
        .sort((a, b) => b.count - a.count)

      // 個別強みランキング（proof_item_id別、label使用）
      topStrengthItems = Object.entries(proofItemCountMap)
        .map(([proofItemId, count]) => {
          const piInfo = piMap.get(proofItemId)
          return { label: piInfo?.label || '', count }
        })
        .filter(item => item.label)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    }

    // 6. バッジにholders（取得者リスト）を紐づけ
    const badgesWithHolders = badges.map((badge: any) => ({
      ...badge,
      holders: badgeHolders
        .filter((h: any) => h.credential_level_id === badge.id)
        .map((h: any) => {
          const client = h.user_id ? clientMap.get(h.user_id) : null
          return {
            id: h.id,
            user_id: h.user_id,
            professional_id: h.professional_id,
            accepted_at: h.accepted_at,
            professionals: h.professionals || (client ? {
              id: null,
              name: client.nickname || '一般会員',
              photo_url: client.photo_url || null,
              title: '',
            } : null),
          }
        }),
    }))

    return NextResponse.json({
      org,
      members: mergedMembers,
      aggregate: aggregateResult.data || null,
      badges: badgesWithHolders,
      badgeHolderCounts,
      badgeHolders,
      badgeMembers: uniqueMembers,
      strengthDistribution,
      topStrengthItems,
    })
  } catch (error: any) {
    console.error('[org-dashboard API] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
