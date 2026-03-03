import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/org-dashboard
 * orgダッシュボードに必要な全データをサーバー側で一括取得。
 * N+1問題（ERR_INSUFFICIENT_RESOURCES）の解消。
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
      invitationsResult,
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

      // 招待一覧
      supabase
        .from('org_invitations')
        .select('*')
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false }),
    ])

    // 3. バッジごとの取得者数を一括取得
    const badges = badgesResult.data || []
    let badgeHolderCounts: Record<string, number> = {}
    let badgeHolders: any[] = []

    if (badges.length > 0) {
      const badgeIds = badges.map((b: any) => b.id)
      const { data: holders } = await supabase
        .from('org_members')
        .select('credential_level_id, professional_id, professionals(id, name, photo_url)')
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

    return NextResponse.json({
      org,
      members: membersResult.data || [],
      aggregate: aggregateResult.data || null,
      badges,
      badgeHolderCounts,
      badgeHolders,
      invitations: invitationsResult.data || [],
    })
  } catch (error: any) {
    console.error('[org-dashboard API] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
