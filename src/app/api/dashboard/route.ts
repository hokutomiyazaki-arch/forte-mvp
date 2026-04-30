import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
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
    supabase.from('personality_items').select('id, label, personality_label, category, is_active, sort_order'),
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

    const isDev = process.env.NODE_ENV === 'development'
    const startTime = Date.now()
    if (isDev) console.log('[Dashboard API] Start')

    const supabase = getSupabaseAdmin()

    // Clerkからメールアドレス・電話番号を取得（外部API不要）
    const user = await currentUser()
    const userEmail = user?.emailAddresses?.[0]?.emailAddress || ''
    const phone = user?.phoneNumbers?.[0]?.phoneNumber || ''
    const identifier = userEmail || phone

    // ────────────────────────────────────────
    // Phase 1: プロフィール + マスターデータ を並列取得
    // ────────────────────────────────────────
    const [proResult, master] = await Promise.all([
      supabase.from('professionals').select('*').eq('user_id', userId).maybeSingle(),
      getMasterData(supabase),
    ])

    if (isDev) console.log('[Dashboard API] Phase 1 done:', Date.now() - startTime, 'ms')

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
        setupCompleted: true,
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
      // 受け取ったリワード: emailマッチ
      crByEmailResult,
      // クライアント構成（normalized_emailベース）
      clientCompositionResult,
    ] = await Promise.all([
      // リワード
      supabase.from('rewards').select('*').eq('professional_id', proId).order('sort_order'),
      // 投票サマリー
      supabase.from('vote_summary').select('*').eq('professional_id', proId),
      // パーソナリティサマリー
      supabase.from('personality_summary').select('*').eq('professional_id', proId),
      // 投票（総数 + コメント付きを1クエリで取得）
      // v1.2 §11.4-2: display_mode/client_photo_url/auth_display_name/voter_professional_id を追加
      // normalized_email はサーバー内集計（voter_vote_count）のみで使用、レスポンスからは除外
      supabase.from('votes')
        .select('id, comment, created_at, display_mode, client_photo_url, auth_display_name, voter_professional_id, normalized_email', { count: 'exact' })
        .eq('professional_id', proId)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false }),
      // 被ブックマーク数（他ユーザーからのブックマーク）
      supabase.from('bookmarks').select('*', { count: 'exact', head: true }).eq('professional_id', proId),
      // NFCカード
      supabase.from('nfc_cards').select('id, card_uid, status, linked_at').eq('user_id', userId).eq('status', 'active').maybeSingle(),
      // org_members: pending招待のみ
      supabase.from('org_members')
        .select('id, organization_id, status, invited_at, organizations(id, name, type, logo_url)')
        .eq('professional_id', proId)
        .eq('status', 'pending'),
      // org_members: バッジ付きレコード（所属・認定 + 取得バッジの両方のソース）
      supabase.from('org_members')
        .select('*, credential_levels(id, name, description, image_url, organization_id, organizations(id, name, type, logo_url))')
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
      // 受け取ったリワード: client_emailマッチ（メール or 電話番号）
      identifier
        ? supabase.from('client_rewards')
            .select('id, reward_id, professional_id, status, created_at')
            .eq('client_email', identifier)
            .in('status', ['active', 'used'])
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: null, error: null }),
      // クライアント構成集計（normalized_emailベース）
      supabase.from('votes')
        .select('normalized_email')
        .eq('professional_id', proId)
        .eq('status', 'confirmed'),
    ])

    if (isDev) console.log('[Dashboard API] Phase 2 done:', Date.now() - startTime, 'ms')

    // ────────────────────────────────────────
    // votes データ整形: 総数 + コメント付きを抽出 + voter_pro / voter_vote_count 付与
    // v1.2 §11.4-2: ダッシュボード Voicesタブで顔写真・名前・プロリンクを表示するため
    //   - display_mode 系フィールドはそのまま透過
    //   - voter_vote_count: このプロ宛て累計（normalized_email ベース集計）
    //   - voter_pro: voter_professional_id をまとめ取り（N+1 回避）
    //   - normalized_email / voter_professional_id はレスポンスから除外（PII）
    // ────────────────────────────────────────
    const totalVotes = votesResult.count || 0
    const allVotes = (votesResult.data || []) as Array<{
      id: string
      comment: string | null
      created_at: string
      display_mode: string | null
      client_photo_url: string | null
      auth_display_name: string | null
      voter_professional_id: string | null
      normalized_email: string | null
    }>

    // voter_vote_count: normalized_email ごとに「このプロ宛て」累計をカウント
    // votesResult は eq('professional_id', proId) で絞り込み済みなので、
    // ここでの集計は自動的に「このプロ宛てのみ」となる
    const countByEmail = new Map<string, number>()
    for (const v of allVotes) {
      if (!v.normalized_email) continue
      countByEmail.set(v.normalized_email, (countByEmail.get(v.normalized_email) ?? 0) + 1)
    }

    // voter_pro: voter_professional_id を一括取得（N+1 回避）
    // card/[id]/route.ts の enrichment パターンを踏襲。
    // 公開情報のみ（id, name, title, photo_url）— title は VoiceComment 型と整合させるため含める
    const voterProIds = Array.from(new Set(
      allVotes
        .map(v => v.voter_professional_id)
        .filter((id): id is string => !!id)
    ))
    const voterProMap = new Map<string, { id: string; name: string; title: string | null; photo_url: string | null }>()
    if (voterProIds.length > 0) {
      const { data: voterPros } = await supabase
        .from('professionals')
        .select('id, name, title, photo_url')
        .in('id', voterProIds)
        .is('deactivated_at', null)
      for (const p of (voterPros || [])) {
        voterProMap.set(p.id, p)
      }
    }

    // コメント付きを抽出 + enrichment + PII 除外
    const commentedVotes = allVotes.filter(v => v.comment && v.comment.trim() !== '')

    // Phase 3 Voice 返信: vote_replies を一括取得（is_deleted=false）
    // 仕様書 §4-3: voiceComments の各 vote に reply を付与（N+1 回避のため一括 IN クエリ）
    const commentedVoteIds = commentedVotes.map(v => v.id)
    const replyMap = new Map<string, {
      id: string
      reply_text: string
      created_at: string
      updated_at: string
      delivered_at: string | null
      delivered_via: 'line' | 'email' | null
    }>()
    if (commentedVoteIds.length > 0) {
      const { data: replies } = await supabase
        .from('vote_replies')
        .select('id, vote_id, reply_text, created_at, updated_at, delivered_at, delivered_via')
        .in('vote_id', commentedVoteIds)
        .eq('is_deleted', false)
      for (const r of (replies || [])) {
        replyMap.set(r.vote_id, {
          id: r.id,
          reply_text: r.reply_text,
          created_at: r.created_at,
          updated_at: r.updated_at,
          delivered_at: r.delivered_at,
          delivered_via: r.delivered_via,
        })
      }
    }

    const voiceComments = commentedVotes.map(v => {
      const voter_vote_count = v.normalized_email
        ? (countByEmail.get(v.normalized_email) ?? 1)
        : 1
      const voter_pro = v.voter_professional_id
        ? voterProMap.get(v.voter_professional_id) ?? null
        : null
      // ★ PII 除外: normalized_email / voter_professional_id をレスポンスから外す
      const { normalized_email, voter_professional_id, ...safe } = v
      return {
        ...safe,
        voter_pro,
        voter_vote_count,
        reply: replyMap.get(v.id) ?? null,
      }
    })

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
          logo_url: org.logo_url,
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
    // 受け取ったリワード: emailマッチ → 詳細取得
    // ────────────────────────────────────────
    const allReceivedCR: any[] = crByEmailResult.data && crByEmailResult.data.length > 0
      ? crByEmailResult.data
      : []

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

    // クライアント構成集計（normalized_emailベース）
    const voterCounts: Record<string, number> = {}
    for (const v of clientCompositionResult.data || []) {
      const email = v.normalized_email || ''
      if (email) voterCounts[email] = (voterCounts[email] || 0) + 1
    }
    const firstTimerCount = Object.values(voterCounts).filter(c => c === 1).length
    const repeaterCount = Object.values(voterCounts).filter(c => c === 2).length
    const regularCount = Object.values(voterCounts).filter(c => c >= 3).length

    if (isDev) console.log('[Dashboard API] Total:', Date.now() - startTime, 'ms')

    return NextResponse.json({
      role: 'professional',
      professional: proData,
      setupCompleted: proData.setup_completed ?? false,
      proofItems,
      rewards: (rewardsResult.data || []).map((r: any) => ({
        id: r.id,
        reward_type: r.reward_type,
        title: r.title || '',
        content: r.content || '',
        url: r.url || '',
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
      firstTimerCount,
      repeaterCount,
      regularCount,
    })
  } catch (err: any) {
    console.error('[api/dashboard] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
