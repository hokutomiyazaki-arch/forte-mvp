import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard
 * 1リクエストでダッシュボードに必要な全データをまとめて返す。
 * サーバー側でPromise.allを使い並列実行。
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    // ────────────────────────────────────────
    // Phase 1: プロフィール + マスターデータを並列取得
    // ────────────────────────────────────────
    const [proResult, proofItemsResult] = await Promise.all([
      supabase.from('professionals').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('proof_items').select('*').order('sort_order'),
    ])

    const proData = proResult.data
    const proofItems = proofItemsResult.data || []

    // プロ未登録の場合、マスターデータのみ返す
    if (!proData) {
      return NextResponse.json({
        professional: null,
        proofItems,
        rewards: [],
        voteSummary: [],
        personalitySummary: [],
        personalityItems: [],
        totalVotes: 0,
        bookmarkCount: 0,
        voiceComments: [],
        gratitudePhrases: [],
        nfcCard: null,
        pendingInvites: [],
        activeOrgs: [],
        credentialBadges: [],
        ownedOrg: null,
      })
    }

    // ────────────────────────────────────────
    // Phase 2: プロIDが分かったら、全データを並列取得
    // ────────────────────────────────────────
    const proId = proData.id

    const [
      rewardsResult,
      voteSummaryResult,
      personalitySummaryResult,
      personalityItemsResult,
      voteCountResult,
      bookmarkCountResult,
      voiceResult,
      phrasesResult,
      nfcResult,
      pendingInvitesResult,
      activeMembersResult,
      credBadgeResult,
      ownedOrgResult,
    ] = await Promise.all([
      // リワード
      supabase.from('rewards').select('*').eq('professional_id', proId).order('sort_order'),
      // 投票サマリー
      supabase.from('vote_summary').select('*').eq('professional_id', proId),
      // パーソナリティサマリー
      supabase.from('personality_summary').select('*').eq('professional_id', proId),
      // パーソナリティ項目マスタ
      supabase.from('personality_items').select('id, label'),
      // 総投票数
      supabase.from('votes').select('*', { count: 'exact', head: true }).eq('professional_id', proId).eq('status', 'confirmed'),
      // ブックマーク数
      supabase.from('bookmarks').select('*', { count: 'exact', head: true }).eq('professional_id', proId),
      // Voiceコメント
      supabase.from('votes')
        .select('id, comment, created_at')
        .eq('professional_id', proId)
        .eq('status', 'confirmed')
        .not('comment', 'is', null)
        .neq('comment', '')
        .order('created_at', { ascending: false }),
      // 感謝フレーズ
      supabase.from('gratitude_phrases').select('*').order('sort_order'),
      // NFCカード
      supabase.from('nfc_cards').select('id, card_uid, status, linked_at').eq('professional_id', proId).eq('status', 'active').maybeSingle(),
      // 団体招待（pending）
      supabase.from('org_members')
        .select('id, organization_id, invited_at, organizations(name, type)')
        .eq('professional_id', proId)
        .eq('status', 'pending'),
      // 所属団体（active, credential_level_idなし）
      supabase.from('org_members')
        .select('id, organization_id, accepted_at, organizations(id, name, type)')
        .eq('professional_id', proId)
        .eq('status', 'active')
        .is('credential_level_id', null),
      // 資格バッジ
      supabase.from('org_members')
        .select('credential_level_id, credential_levels(id, name, description, image_url), organizations(id, name)')
        .eq('professional_id', proId)
        .eq('status', 'active')
        .not('credential_level_id', 'is', null),
      // オーナー団体
      supabase.from('organizations')
        .select('id, name, type')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    // ────────────────────────────────────────
    // 団体データ整形
    // ────────────────────────────────────────
    const pendingInvites = (pendingInvitesResult.data || []).map((m: any) => ({
      id: m.id,
      organization_id: m.organization_id,
      org_name: m.organizations?.name || '不明な団体',
      org_type: m.organizations?.type || 'store',
      invited_at: m.invited_at,
    }))

    // 所属団体: 重複排除
    const activeOrgsList = (activeMembersResult.data || [])
      .filter((m: any) => m.organizations)
      .map((m: any) => ({
        id: m.organizations.id,
        member_id: m.id,
        org_name: m.organizations.name,
        org_type: m.organizations.type,
        accepted_at: m.accepted_at,
      }))
    const seen = new Set<string>()
    const activeOrgs = activeOrgsList.filter((o: any) => {
      if (seen.has(o.id)) return false
      seen.add(o.id)
      return true
    })

    // 資格バッジ整形
    const credentialBadges = (credBadgeResult.data || [])
      .filter((m: any) => m.credential_levels && m.organizations)
      .map((m: any) => ({
        id: m.credential_levels.id,
        name: m.credential_levels.name,
        description: m.credential_levels.description,
        image_url: m.credential_levels.image_url,
        org_name: m.organizations.name,
        org_id: m.organizations.id,
      }))

    return NextResponse.json({
      professional: proData,
      proofItems,
      rewards: (rewardsResult.data || []).map((r: any) => ({
        id: r.id,
        reward_type: r.reward_type,
        title: r.title || '',
        content: r.content || '',
      })),
      voteSummary: voteSummaryResult.data || [],
      personalitySummary: personalitySummaryResult.data || [],
      personalityItems: personalityItemsResult.data || [],
      totalVotes: voteCountResult.count || 0,
      bookmarkCount: bookmarkCountResult.count || 0,
      voiceComments: voiceResult.data || [],
      gratitudePhrases: phrasesResult.data || [],
      nfcCard: nfcResult.data || null,
      pendingInvites,
      activeOrgs,
      credentialBadges,
      ownedOrg: ownedOrgResult.data || null,
    })
  } catch (err: any) {
    console.error('[api/dashboard] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
