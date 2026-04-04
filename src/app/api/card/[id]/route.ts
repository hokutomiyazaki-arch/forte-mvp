import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { auth } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: proId } = await params
  const supabase = getSupabaseAdmin()

  // Clerk認証（オプション — ブックマーク状態チェック用）
  let currentUserId: string | null = null
  try {
    const { userId } = await auth()
    currentUserId = userId
  } catch {
    // 未ログインでもOK
  }

  try {
    // === 並列取得 ===
    const [
      proResult,
      voteSummaryResult,
      proofItemsResult,
      personalitySummaryResult,
      personalityItemsResult,
      commentsResult,
      totalVotesResult,
      bookmarkCountResult,
      orgMembersResult,
      badgeMembersResult,
      sessionCountResult,
      velocityResult,
    ] = await Promise.all([
      // 1. プロ情報
      supabase.from('professionals').select('*').eq('id', proId).maybeSingle(),
      // 2. 投票サマリー
      supabase.from('vote_summary').select('*').eq('professional_id', proId),
      // 3. プルーフ項目マスタ
      supabase.from('proof_items').select('id, label, tab, strength_label'),
      // 4. 人柄サマリー
      supabase.from('personality_summary').select('*').eq('professional_id', proId),
      // 5. 人柄項目マスタ
      supabase.from('personality_items').select('id, label'),
      // 6. コメント付き投票
      supabase.from('votes').select('id, comment, created_at')
        .eq('professional_id', proId).eq('status', 'confirmed')
        .not('comment', 'is', null).neq('comment', '')
        .order('created_at', { ascending: false }),
      // 7. 総投票数
      supabase.from('votes').select('*', { count: 'exact', head: true })
        .eq('professional_id', proId).eq('status', 'confirmed'),
      // 8. ブックマーク数
      supabase.from('bookmarks').select('*', { count: 'exact', head: true })
        .eq('professional_id', proId),
      // 9. 所属団体
      supabase.from('org_members')
        .select('organization_id, credential_level_id, organizations(id, name, type)')
        .eq('professional_id', proId).eq('status', 'active'),
      // 10. バッジ
      supabase.from('org_members')
        .select('credential_level_id, credential_levels(id, name, description, image_url), organizations(id, name)')
        .eq('professional_id', proId).eq('status', 'active')
        .not('credential_level_id', 'is', null),
      // 11. (旧session_count — 実レコード数に統一したため未使用、Promise.allの構造維持)
      Promise.resolve({ data: null, error: null }),
      // 12. Velocity・リピーター率・CLIENT COMPOSITION用データ
      supabase.from('votes')
        .select('created_at, voter_email')
        .eq('professional_id', proId)
        .eq('status', 'confirmed'),
    ])

    // ブックマーク状態（ログイン中のみ）
    let isBookmarked = false
    if (currentUserId) {
      const { data: bookmark } = await supabase
        .from('bookmarks')
        .select('id')
        .eq('user_id', currentUserId)
        .eq('professional_id', proId)
        .maybeSingle()
      isBookmarked = !!bookmark
    }

    // Velocity・リピーター率・CLIENT COMPOSITION集計（全て実レコード数ベース）
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    let recentProofs = 0
    const voterCounts: Record<string, number> = {}
    for (const v of velocityResult.data || []) {
      if (new Date(v.created_at) >= thirtyDaysAgo) recentProofs++
      const email = v.voter_email || ''
      if (email) voterCounts[email] = (voterCounts[email] || 0) + 1
    }
    const counts = Object.values(voterCounts)
    const firstTimerCount = counts.filter(c => c === 1).length
    const repeaterCount = counts.filter(c => c === 2).length
    const regularCount = counts.filter(c => c >= 3).length

    // CLIENT COMPOSITIONバー（実レコード数ベースに統一）
    const sessionCounts = { first: firstTimerCount, repeat: repeaterCount, regular: regularCount }

    // リピーター率
    const totalVoters = Object.keys(voterCounts).length
    let repeaterRate: number | null = null
    if (totalVoters >= 10) {
      const repeaterAndRegular = counts.filter(c => c >= 2).length
      repeaterRate = totalVoters > 0 ? Math.round((repeaterAndRegular / totalVoters) * 100) : 0
    }

    return NextResponse.json({
      pro: proResult.data,
      voteSummary: voteSummaryResult.data || [],
      proofItems: proofItemsResult.data || [],
      personalitySummary: personalitySummaryResult.data || [],
      personalityItems: personalityItemsResult.data || [],
      comments: commentsResult.data || [],
      totalVotes: totalVotesResult.count || 0,
      bookmarkCount: bookmarkCountResult.count || 0,
      isBookmarked,
      currentUserId,
      orgMembers: orgMembersResult.data || [],
      badgeMembers: badgeMembersResult.data || [],
      sessionCounts,
      recentProofs,
      repeaterRate,
      firstTimerCount,
      repeaterCount,
      regularCount,
    })
  } catch (err) {
    console.error('[api/card] Error:', err)
    return NextResponse.json({ error: 'Failed to load card data' }, { status: 500 })
  }
}
