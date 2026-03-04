import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ────────────────────────────────────────
// マスタデータキャッシュ（全ユーザー共通、5分TTL）
// ────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000
let masterCache: { proofItems: any[]; personalityItems: any[]; phrases: any[] } | null = null
let masterCacheTime = 0

async function getMasterData(supabase: ReturnType<typeof getSupabaseAdmin>) {
  if (masterCache && Date.now() - masterCacheTime < CACHE_TTL) {
    return masterCache
  }
  const [proofItemsResult, personalityItemsResult, phrasesResult] = await Promise.all([
    supabase.from('proof_items').select('*').order('sort_order'),
    supabase.from('personality_items').select('id, label'),
    supabase.from('gratitude_phrases').select('*').order('sort_order'),
  ])
  masterCache = {
    proofItems: proofItemsResult.data || [],
    personalityItems: personalityItemsResult.data || [],
    phrases: phrasesResult.data || [],
  }
  masterCacheTime = Date.now()
  return masterCache
}

/**
 * GET /api/dashboard
 * 1リクエストでダッシュボードに必要な全データをまとめて返す。
 * サーバー側でPromise.allを使い並列実行。
 *
 * 最適化:
 * - マスタデータ(proof_items, personality_items, gratitude_phrases)を5分キャッシュ → -3クエリ
 * - votes 2クエリ(COUNT + コメント) → 1クエリに統合
 * - bookmarks 2クエリ(被COUNT + 自分の一覧) → 一覧から被COUNTは別途(統合不可)
 * - org_members: pending招待 + バッジ表示(credential_level_id付き)
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const startTime = Date.now()
    console.log('[Dashboard API] Start')

    const supabase = getSupabaseAdmin()

    // ────────────────────────────────────────
    // Phase 1: プロフィール + マスターデータ + Clerkメール を並列取得
    // ────────────────────────────────────────
    const [proResult, master, clerkRes] = await Promise.all([
      supabase.from('professionals').select('*').eq('user_id', userId).maybeSingle(),
      getMasterData(supabase),
      fetch(`https://api.clerk.com/v1/users/${userId}`, {
        headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
      }).then(r => r.json()).catch(() => null),
    ])
    const userEmail = clerkRes?.email_addresses?.[0]?.email_address || ''

    console.log('[Dashboard API] Phase 1 done:', Date.now() - startTime, 'ms')

    const proDataRaw = proResult.data
    const { proofItems, personalityItems, phrases } = master

    // deactivated proはclientとして扱う（proDataをnullにする）
    const isDeactivatedPro = !!(proDataRaw && proDataRaw.deactivated_at)
    const proData = isDeactivatedPro ? null : proDataRaw

    // プロ未登録 or deactivated proの場合、クライアント向けデータを返す
    if (!proData) {
      // クライアントでもマイプルーフQRトークンとプロフィールは必要
      const [myProofCardResult, clientResult, ownedOrgResult] = await Promise.all([
        supabase.from('my_proof_cards').select('qr_token').eq('user_id', userId).maybeSingle(),
        supabase.from('clients').select('nickname, photo_url, date_of_birth').eq('user_id', userId).maybeSingle(),
        supabase.from('organizations').select('id, name, type').eq('owner_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])

      // role判定: deactivated pro or clientレコードあり → client、どちらもなし → null(onboarding)
      const clientRole = (isDeactivatedPro || clientResult.data) ? 'client' : null

      return NextResponse.json({
        role: clientRole,
        professional: null,
        proofItems,
        rewards: [],
        voteSummary: [],
        personalitySummary: [],
        personalityItems,
        totalVotes: 0,
        bookmarkCount: 0,
        voiceComments: [],
        gratitudePhrases: phrases,
        nfcCard: null,
        pendingInvites: [],
        activeOrgs: [],
        credentialBadges: [],
        ownedOrg: ownedOrgResult.data || null,
        myProofQrToken: myProofCardResult.data?.qr_token || null,
        clientProfile: clientResult.data || null,
      })
    }

    // ────────────────────────────────────────
    // Phase 2: プロIDが分かったら、全データを並列取得
    // 統合: votes(COUNT+コメント→1), org_members(pending+バッジ)
    // キャッシュ済: personality_items, gratitude_phrases
    // ────────────────────────────────────────
    const proId = proData.id

    const [
      rewardsResult,
      voteSummaryResult,
      personalitySummaryResult,
      votesResult,
      receivedBookmarkCountResult,
      nfcResult,
      pendingMembersResult,
      proBadgesResult,
      ownedOrgResult,
      myProofCardResult,
      bookmarksResult,
      certApplicationsResult,
      // 受け取ったリワード: email + client_user_id の2方法を並列
      crByEmailResult,
      crByUserIdResult,
    ] = await Promise.all([
      // リワード
      supabase.from('rewards').select('*').eq('professional_id', proId).order('sort_order'),
      // 投票サマリー
      supabase.from('vote_summary').select('*').eq('professional_id', proId),
      // パーソナリティサマリー
      supabase.from('personality_summary').select('*').eq('professional_id', proId),
      // 投票（総数 + コメント付きを1クエリで取得）
      supabase.from('votes')
        .select('id, comment, created_at', { count: 'exact' })
        .eq('professional_id', proId)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false }),
      // 被ブックマーク数（他ユーザーからのブックマーク）
      supabase.from('bookmarks').select('*', { count: 'exact', head: true }).eq('professional_id', proId),
      // NFCカード
      supabase.from('nfc_cards').select('id, card_uid, status, linked_at').eq('user_id', userId).eq('status', 'active').maybeSingle(),
      // org_members: pending招待のみ
      supabase.from('org_members')
        .select('id, organization_id, status, invited_at, organizations(id, name, type)')
        .eq('professional_id', proId)
        .eq('status', 'pending'),
      // org_members: バッジ付きレコード（所属・認定 + 取得バッジの両方のソース）
      supabase.from('org_members')
        .select('*, credential_levels(id, name, description, image_url, organization_id, organizations(id, name, type))')
        .eq('professional_id', proId)
        .not('credential_level_id', 'is', null),
      // オーナー団体
      supabase.from('organizations')
        .select('id, name, type')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // マイプルーフカード（QRトークン用）
      supabase.from('my_proof_cards')
        .select('qr_token')
        .eq('user_id', userId)
        .maybeSingle(),
      // ブックマーク一覧（気になるプロ）
      supabase.from('bookmarks')
        .select('id, created_at, professional_id, professionals(id, name, title, photo_url, prefecture, area_description)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      // 認定申請（Lv.2 SPECIALIST）
      supabase.from('certification_applications')
        .select('category_slug, status')
        .eq('professional_id', proId),
      // 受け取ったリワード: 方法1 — client_email
      userEmail
        ? supabase.from('client_rewards')
            .select('id, reward_id, professional_id, status, created_at')
            .eq('client_email', userEmail)
            .in('status', ['active', 'used'])
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: null, error: null }),
      // 受け取ったリワード: 方法2 — votes.client_user_id
      supabase.from('votes')
        .select('id, selected_reward_id')
        .eq('client_user_id', userId)
        .not('selected_reward_id', 'is', null),
    ])

    console.log('[Dashboard API] Phase 2 done:', Date.now() - startTime, 'ms')

    // ────────────────────────────────────────
    // votes データ整形: 総数 + コメント付きをJSで分離
    // ────────────────────────────────────────
    const totalVotes = votesResult.count || 0
    const voiceComments = (votesResult.data || []).filter(
      (v: any) => v.comment && v.comment.trim() !== ''
    )

    // ────────────────────────────────────────
    // pending招待 (org_membersから)
    // ────────────────────────────────────────
    const pendingInvites = (pendingMembersResult.data || [])
      .map((m: any) => ({
        id: m.id,
        organization_id: m.organization_id,
        org_name: m.organizations?.name || '不明な団体',
        org_type: m.organizations?.type || 'store',
        invited_at: m.invited_at,
      }))

    // ────────────────────────────────────────
    // org_members(バッジ付き) → 所属・認定 + 取得バッジ
    // ────────────────────────────────────────
    const allBadgeRecords = proBadgesResult.data || []

    // 所属・認定: org_membersを団体ごとにグループ化（重複排除）
    const orgMap = new Map<string, any>()
    for (const b of allBadgeRecords) {
      const cl = b.credential_levels as any
      const org = cl?.organizations
      if (org && !orgMap.has(org.id)) {
        orgMap.set(org.id, {
          id: org.id,
          member_id: b.id,
          org_name: org.name,
          org_type: org.type,
          accepted_at: b.accepted_at,
        })
      }
    }
    const activeOrgs = Array.from(orgMap.values())

    // 取得バッジ: org_membersから個別バッジ
    const credentialBadges = allBadgeRecords
      .filter((b: any) => b.credential_levels)
      .map((b: any) => {
        const cl = b.credential_levels as any
        return {
          id: cl.id,
          name: cl.name,
          description: cl.description,
          image_url: cl.image_url,
          org_name: cl.organizations?.name || '',
          org_id: cl.organizations?.id || '',
        }
      })

    // ────────────────────────────────────────
    // 受け取ったリワード: email → vote fallback → 詳細取得
    // ────────────────────────────────────────
    let allReceivedCR: any[] = crByEmailResult.data && crByEmailResult.data.length > 0
      ? crByEmailResult.data
      : []

    // email で見つからない場合、votes.client_user_id 経由で検索
    if (allReceivedCR.length === 0 && crByUserIdResult.data && crByUserIdResult.data.length > 0) {
      const voteIds = crByUserIdResult.data.map((v: any) => v.id)
      const { data: crByVote } = await supabase.from('client_rewards')
        .select('id, reward_id, professional_id, status, created_at')
        .in('vote_id', voteIds)
        .in('status', ['active', 'used'])
        .order('created_at', { ascending: false })
      if (crByVote && crByVote.length > 0) allReceivedCR = crByVote
    }

    let receivedRewards: any[] = []
    if (allReceivedCR.length > 0) {
      const rIds = Array.from(new Set(allReceivedCR.map((cr: any) => cr.reward_id)))
      const pIds = Array.from(new Set(allReceivedCR.map((cr: any) => cr.professional_id)))

      const [rDetails, pDetails] = await Promise.all([
        supabase.from('rewards').select('id, reward_type, title, content').in('id', rIds),
        supabase.from('professionals').select('id, name').in('id', pIds),
      ])

      const rMap = new Map<string, any>()
      if (rDetails.data) for (const r of rDetails.data) rMap.set(r.id, r)
      const pMap = new Map<string, string>()
      if (pDetails.data) for (const p of pDetails.data) pMap.set(p.id, p.name)

      receivedRewards = allReceivedCR.map((cr: any) => {
        const reward = rMap.get(cr.reward_id)
        return {
          id: cr.id,
          reward_id: cr.reward_id,
          reward_type: reward?.reward_type || '',
          title: reward?.title || '',
          content: reward?.content || '',
          status: cr.status,
          professional_id: cr.professional_id,
          pro_name: pMap.get(cr.professional_id) || 'プロ',
          created_at: cr.created_at,
        }
      })
    }

    console.log('[Dashboard API] Total:', Date.now() - startTime, 'ms')

    return NextResponse.json({
      role: 'professional',
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
      personalityItems,
      totalVotes,
      bookmarkCount: receivedBookmarkCountResult.count || 0,
      voiceComments,
      gratitudePhrases: phrases,
      nfcCard: nfcResult.data || null,
      pendingInvites,
      activeOrgs,
      credentialBadges,
      ownedOrg: ownedOrgResult.data || null,
      myProofQrToken: myProofCardResult.data?.qr_token || null,
      bookmarks: bookmarksResult.data || [],
      certApplications: certApplicationsResult.data || [],
      receivedRewards,
    })
  } catch (err: any) {
    console.error('[api/dashboard] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
