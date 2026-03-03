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

    // 2. 残りのデータを並列取得
    const [
      membersResult,
      aggregateResult,
      badgesResult,
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
    ])

    // 3. バッジごとの取得者を一括取得（バッジベースのメンバー管理）
    const badges = badgesResult.data || []
    let badgeHolderCounts: Record<string, number> = {}
    let badgeHolders: any[] = []

    if (badges.length > 0) {
      const badgeIds = badges.map((b: any) => b.id)
      const { data: holders } = await supabase
        .from('org_members')
        .select('credential_level_id, professional_id, accepted_at, professionals(id, name, photo_url, title), credential_levels(id, name, image_url)')
        .eq('organization_id', org.id)
        .eq('status', 'active')
        .in('credential_level_id', badgeIds)

      if (holders) {
        badgeHolders = holders
        for (const h of holders) {
          if (h.credential_level_id) {
            badgeHolderCounts[h.credential_level_id] = (badgeHolderCounts[h.credential_level_id] || 0) + 1
          }
        }
      }
    }

    // バッジホルダーから一意メンバーリスト（同じプロが複数バッジを持つ場合は重複排除）
    const memberMap = new Map<string, any>()
    for (const h of badgeHolders) {
      if (h.professionals && !memberMap.has(h.professional_id)) {
        memberMap.set(h.professional_id, {
          professional_id: h.professional_id,
          name: h.professionals.name,
          photo_url: h.professionals.photo_url,
          title: h.professionals.title,
          badge_name: h.credential_levels?.name,
          accepted_at: h.accepted_at,
        })
      }
    }
    const uniqueMembers = Array.from(memberMap.values())

    // 4. メンバーリスト統合: org_proof_summary + badgeMembers（投票なしのバッジ取得者も含める）
    const proofMembers = membersResult.data || []
    const proofMemberIds = new Set(proofMembers.map((m: any) => m.professional_id))
    const mergedMembers = [
      ...proofMembers,
      // バッジ取得者のうち、org_proof_summaryに含まれていない人を追加（投票0件）
      ...uniqueMembers
        .filter(m => !proofMemberIds.has(m.professional_id))
        .map(m => ({
          professional_id: m.professional_id,
          professional_name: m.name,
          photo_url: m.photo_url,
          title: m.title,
          total_votes: 0,
          organization_id: org.id,
        })),
    ]

    // 5. バッジにholders（取得者リスト）を紐づけ
    const badgesWithHolders = badges.map((badge: any) => ({
      ...badge,
      holders: badgeHolders
        .filter((h: any) => h.credential_level_id === badge.id)
        .map((h: any) => ({
          professional_id: h.professional_id,
          accepted_at: h.accepted_at,
          professionals: h.professionals,
        })),
    }))

    return NextResponse.json({
      org,
      members: mergedMembers,
      aggregate: aggregateResult.data || null,
      badges: badgesWithHolders,
      badgeHolderCounts,
      badgeHolders,
      badgeMembers: uniqueMembers,
    })
  } catch (error: any) {
    console.error('[org-dashboard API] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
