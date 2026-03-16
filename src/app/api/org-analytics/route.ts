import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { TAB_DISPLAY_NAMES } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/**
 * GET /api/org-analytics?orgId=xxx&credential_level_id=yyy
 * 分析タブ用データを遅延取得。
 * credential_level_id が指定された場合、そのバッジを持つメンバーのみに絞り込む。
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('orgId')
    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
    }

    const credentialLevelId = request.nextUrl.searchParams.get('credential_level_id')

    const supabase = getSupabaseAdmin()

    // オーナー権限チェック
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .eq('owner_id', userId)
      .maybeSingle()

    if (orgError) throw orgError
    if (!org) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // メンバーリスト取得（professional_id一覧 + 名前マップ用）
    // credential_level_idが指定された場合、そのバッジを持つメンバーに絞る
    let holdersQuery = supabase
      .from('org_members')
      .select('professional_id, professionals(id, name, photo_url)')
      .eq('organization_id', orgId)
      .eq('status', 'active')

    if (credentialLevelId) {
      holdersQuery = holdersQuery.eq('credential_level_id', credentialLevelId)
    } else {
      holdersQuery = holdersQuery.not('credential_level_id', 'is', null)
    }

    const [proofResult, holdersResult] = await Promise.all([
      supabase
        .from('org_proof_summary')
        .select('professional_id, professional_name, photo_url, total_votes')
        .eq('organization_id', orgId),
      holdersQuery,
    ])

    // メンバー統合
    const proofMembers = proofResult.data || []
    const badgeHolders = holdersResult.data || []

    // バッジフィルタ時: バッジ保有者のprofessional_idセットを作る
    const badgeHolderIds = new Set(badgeHolders.map(h => h.professional_id))

    const memberMap = new Map<string, { name: string; photo_url: string | null; total_votes: number }>()

    if (credentialLevelId) {
      // フィルタ時: バッジ保有者のみ。org_proof_summaryから投票数を取得
      const proofMap = new Map<string, { name: string; photo_url: string | null; total_votes: number }>()
      for (const m of proofMembers) {
        proofMap.set(m.professional_id, {
          name: m.professional_name || '不明',
          photo_url: m.photo_url || null,
          total_votes: m.total_votes || 0,
        })
      }
      for (const h of badgeHolders) {
        const pro = h.professionals as any
        const proofInfo = proofMap.get(h.professional_id)
        if (!memberMap.has(h.professional_id)) {
          memberMap.set(h.professional_id, {
            name: proofInfo?.name || pro?.name || '不明',
            photo_url: proofInfo?.photo_url || pro?.photo_url || null,
            total_votes: proofInfo?.total_votes || 0,
          })
        }
      }
    } else {
      // 全メンバー: 既存ロジック
      for (const m of proofMembers) {
        memberMap.set(m.professional_id, {
          name: m.professional_name || '不明',
          photo_url: m.photo_url || null,
          total_votes: m.total_votes || 0,
        })
      }
      for (const h of badgeHolders) {
        const pro = h.professionals as any
        if (pro && !memberMap.has(h.professional_id)) {
          memberMap.set(h.professional_id, {
            name: pro.name || '不明',
            photo_url: pro.photo_url || null,
            total_votes: 0,
          })
        }
      }
    }

    const memberProIds = Array.from(memberMap.keys())

    if (memberProIds.length === 0) {
      return NextResponse.json({ analytics: null })
    }

    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const [
      strengthResult,
      proofItemsResult,
      commentsResult,
      monthlyResult,
    ] = await Promise.all([
      // 強み分布: selected_proof_ids + proof_items で集計
      supabase
        .from('votes')
        .select('selected_proof_ids')
        .in('professional_id', memberProIds)
        .not('selected_proof_ids', 'is', null),

      // proof_items マスタ
      supabase
        .from('proof_items')
        .select('id, tab, strength_label'),

      // 最新コメント
      supabase
        .from('votes')
        .select('comment, created_at, professional_id')
        .in('professional_id', memberProIds)
        .not('comment', 'is', null)
        .neq('comment', '')
        .order('created_at', { ascending: false })
        .limit(20),

      // 月別トレンド（直近6ヶ月）
      supabase
        .from('votes')
        .select('created_at')
        .in('professional_id', memberProIds)
        .gte('created_at', sixMonthsAgo.toISOString()),
    ])

    // 強み分布集計（selected_proof_ids → proof_items.tab で集計）
    const TAB_LABELS = TAB_DISPLAY_NAMES
    const piMap = new Map<string, { tab: string; strength_label: string }>()
    for (const pi of proofItemsResult.data || []) {
      piMap.set(pi.id, { tab: pi.tab, strength_label: pi.strength_label })
    }

    const tabCountMap: Record<string, number> = {}
    if (strengthResult.data) {
      for (const v of strengthResult.data) {
        const pids: string[] = v.selected_proof_ids || []
        for (const pid of pids) {
          const piInfo = piMap.get(pid)
          if (piInfo?.tab) {
            tabCountMap[piInfo.tab] = (tabCountMap[piInfo.tab] || 0) + 1
          }
        }
      }
    }
    const strengthDistribution = Object.entries(tabCountMap)
      .map(([tab, count]) => ({ label: TAB_LABELS[tab] || tab, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)

    // コメント整形
    const recentComments = (commentsResult.data || []).map((v: any) => {
      const pro = memberMap.get(v.professional_id)
      return {
        comment: v.comment,
        created_at: v.created_at,
        professional_name: pro?.name || '不明',
        professional_photo: pro?.photo_url || null,
      }
    })

    // 月別トレンド集計
    const monthlyMap: Record<string, number> = {}
    if (monthlyResult.data) {
      for (const v of monthlyResult.data) {
        const month = v.created_at.substring(0, 7)
        monthlyMap[month] = (monthlyMap[month] || 0) + 1
      }
    }
    const monthlyTrend = Object.entries(monthlyMap)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))

    // 日別プルーフ推移（直近30日）
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().substring(0, 10)
    const dailyMap: Record<string, number> = {}
    if (monthlyResult.data) {
      for (const v of monthlyResult.data) {
        if (v.created_at) {
          const date = v.created_at.substring(0, 10)
          if (date >= thirtyDaysAgoStr) {
            dailyMap[date] = (dailyMap[date] || 0) + 1
          }
        }
      }
    }
    const dailyTrend: { date: string; count: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().substring(0, 10)
      dailyTrend.push({ date: dateStr, count: dailyMap[dateStr] || 0 })
    }

    // メンバー別プルーフ数
    const memberProofCounts = Array.from(memberMap.entries())
      .map(([professional_id, m]) => ({
        professional_id,
        name: m.name,
        photo_url: m.photo_url,
        proof_count: m.total_votes,
      }))
      .sort((a, b) => b.proof_count - a.proof_count)

    return NextResponse.json({
      analytics: {
        memberProofCounts,
        strengthDistribution,
        recentComments,
        monthlyTrend,
        dailyTrend,
      },
    })
  } catch (error: any) {
    console.error('[org-analytics API] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
