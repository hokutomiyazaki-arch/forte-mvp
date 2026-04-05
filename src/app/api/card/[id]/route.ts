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
      supabase.from('votes').select('id, comment, created_at, normalized_email')
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
      // 12. Velocity・リピーター率・CLIENT COMPOSITION用データ（session_countフォールバック対応）
      supabase.from('votes')
        .select('id, created_at, normalized_email, session_count')
        .eq('professional_id', proId)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: true }),
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

    // Velocity・リピーター率・CLIENT COMPOSITION集計（session_countフォールバック対応）
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    let recentProofs = 0

    // voterInfoMap: normalized_email → { totalCount, firstSessionCount, firstVoteId }
    interface VoterInfo {
      totalCount: number
      firstSessionCount: string | null
      firstVoteId: string
    }
    const voterInfoMap: Record<string, VoterInfo> = {}

    for (const v of velocityResult.data || []) {
      if (new Date(v.created_at) >= thirtyDaysAgo) recentProofs++
      const email = v.normalized_email || ''
      if (!email) continue
      if (!voterInfoMap[email]) {
        voterInfoMap[email] = {
          totalCount: 1,
          firstSessionCount: v.session_count || null,
          firstVoteId: v.id,
        }
      } else {
        voterInfoMap[email].totalCount += 1
      }
    }

    // 最終判定関数: Math.max(旧ステータス, 新ステータス)
    const getVoterLevel = (info: VoterInfo): number => {
      let oldLevel = 1
      if (info.firstSessionCount === 'repeat') oldLevel = 2
      if (info.firstSessionCount === 'regular') oldLevel = 3
      const newRecords = info.totalCount - 1
      let newLevel = 1
      if (newRecords >= 2) newLevel = 3
      else if (newRecords >= 1) newLevel = 2
      return Math.max(oldLevel, newLevel)
    }

    let firstTimerCount = 0
    let repeaterCount = 0
    let regularCount = 0
    for (const info of Object.values(voterInfoMap)) {
      const level = getVoterLevel(info)
      if (level >= 3) regularCount++
      else if (level === 2) repeaterCount++
      else firstTimerCount++
    }

    const sessionCounts = { first: firstTimerCount, repeat: repeaterCount, regular: regularCount }

    // リピーター率
    const totalVoters = Object.keys(voterInfoMap).length
    let repeaterRate: number | null = null
    if (totalVoters >= 10) {
      const repeaterAndRegular = Object.values(voterInfoMap).filter(info => getVoterLevel(info) >= 2).length
      repeaterRate = totalVoters > 0 ? Math.round((repeaterAndRegular / totalVoters) * 100) : 0
    }

    return NextResponse.json({
      pro: proResult.data,
      voteSummary: voteSummaryResult.data || [],
      proofItems: proofItemsResult.data || [],
      personalitySummary: personalitySummaryResult.data || [],
      personalityItems: personalityItemsResult.data || [],
      comments: (commentsResult.data || []).map((c: { id: string; comment: string; created_at: string; normalized_email: string }) => {
        const info = voterInfoMap[c.normalized_email]
        const isFirstVote = info && info.firstVoteId === c.id
        let voterVoteCount = 1
        if (info && !isFirstVote) {
          voterVoteCount = getVoterLevel(info)
        }
        return {
          id: c.id,
          comment: c.comment,
          created_at: c.created_at,
          voter_vote_count: voterVoteCount,
        }
      }),
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
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (err) {
    console.error('[api/card] Error:', err)
    return NextResponse.json({ error: 'Failed to load card data' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}
