/**
 * SEO Step 5 Phase A: /card/[id] のデータ取得共通ロジック
 *
 * Server Component (page.tsx) と既存 API route (/api/card/[id]) の両方から
 * 呼び出すための共通関数。元々 route.ts に書かれていた全ロジックを移植。
 *
 * 設計原則:
 *   - REALPROOF の鉄則: .single() 禁止 → .maybeSingle()
 *   - professionals は deactivated_at NULL フィルタしない (deactivated_at !== null の場合
 *     呼び出し側で「現在非公開」専用画面を出すため)
 *   - currentUserId が null ならブックマーク状態は常に false
 */

import { getSupabaseAdmin } from '@/lib/supabase'

// ─── 内部型 ───
interface VoteWithVoterPro {
  id: string
  created_at: string
  display_mode: string | null
  client_photo_url: string | null
  auth_display_name: string | null
  voter_professional_id: string | null
}
interface VoterPro {
  id: string
  name: string
  title: string | null
  photo_url: string | null
}
interface VoterInfo {
  totalCount: number
  firstSessionCount: string | null
  firstVoteId: string
}
interface VoiceReply {
  id: string
  reply_text: string
  created_at: string
  updated_at: string
  delivered_at: string | null
  delivered_via: 'line' | 'email' | null
}

// ─── 公開型 ───
export interface EnrichedComment {
  id: string
  comment: string
  created_at: string
  display_mode: string | null
  client_photo_url: string | null
  auth_display_name: string | null
  voter_pro: VoterPro | null
  voter_vote_count: number
  reply: VoiceReply | null
  /** Phase 3: この記録で本人が選んだ強みの本文（proof_items.label＝長い方・最大3件・重複排除）。無ければ空配列。 */
  proofTags: string[]
}

export interface Supporter {
  vote_id: string
  photo_url: string
  display_name: string
  is_pro: boolean
  created_at: string
  // pro_link 票のみ: 投票者プロのカード '/card/{voter_professional_id}'。
  // クライアント顔(photo)票では undefined（クリックで Voices タブにスクロールする従来挙動）。
  linkHref?: string
}

export interface ProMenu {
  id: string
  name: string
  price_text: string
  category_tags: string[]
  description: string | null
  display_order: number
}

export interface CardData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pro: any | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  voteSummary: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proofItems: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  personalitySummary: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  personalityItems: any[]
  comments: EnrichedComment[]
  supporters: Supporter[]
  menus: ProMenu[]
  totalVotes: number
  bookmarkCount: number
  isBookmarked: boolean
  currentUserId: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orgMembers: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  badgeMembers: any[]
  sessionCounts: { first: number; repeat: number; regular: number }
  recentProofs: number
  repeaterRate: number | null
  firstTimerCount: number
  repeaterCount: number
  regularCount: number
}

export async function getCardData(
  proId: string,
  currentUserId: string | null
): Promise<CardData> {
  const supabase = getSupabaseAdmin()

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
    /* sessionCountResult */ ,
    velocityResult,
    /* supportersResult — 下で normalized_email 込み + range ページネーション取得 */ ,
    menusResult,
  ] = await Promise.all([
    // 1. プロ情報
    supabase.from('professionals').select('*').eq('id', proId).maybeSingle(),
    // 2. 投票サマリー
    supabase.from('vote_summary').select('*').eq('professional_id', proId),
    // 3. プルーフ項目マスタ
    supabase.from('proof_items').select('id, label, tab, strength_label'),
    // 4. 人柄サマリー
    supabase.from('personality_summary').select('*').eq('professional_id', proId),
    // 5. 人柄項目マスタ（category / is_active 含む）
    supabase.from('personality_items').select('id, label, personality_label, description, category, is_active, sort_order, image_url'),
    // 6. コメント付き投票
    supabase.from('votes')
      .select('id, comment, created_at, normalized_email, display_mode, client_photo_url, auth_display_name, voter_professional_id, selected_proof_ids')
      .eq('professional_id', proId).eq('status', 'confirmed')
      .not('comment', 'is', null).neq('comment', '').neq('comment', '[deleted]')
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
    // 13. (Supporters Strip 用 — Promise.all の外で range ページネーション取得。構造維持のためプレースホルダ)
    Promise.resolve({ data: null, error: null }),
    // 14. サービス・案内 (is_active = true のみ)
    supabase.from('pro_menus')
      .select('id, name, price_text, category_tags, description, display_order')
      .eq('professional_id', proId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
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

  // Velocity・リピーター率・CLIENT COMPOSITION 集計
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  let recentProofs = 0
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

  // 最終判定: Math.max(旧ステータス, 新ステータス)
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

  // リピーター率 (10人以上のとき)
  const totalVoters = Object.keys(voterInfoMap).length
  let repeaterRate: number | null = null
  if (totalVoters >= 10) {
    const repeaterAndRegular = Object.values(voterInfoMap).filter(info => getVoterLevel(info) >= 2).length
    repeaterRate = totalVoters > 0 ? Math.round((repeaterAndRegular / totalVoters) * 100) : 0
  }

  // === comments / supporters 用の voter_pro マップを「別々に」構築 ===
  const commentsRaw = (commentsResult.data || []) as Array<VoteWithVoterPro & { comment: string; normalized_email: string | null; selected_proof_ids: string[] | null }>

  // Supporters Strip 用: photo/pro_link の confirmed 票を全件ページネーション取得。
  // normalized_email は「投票者同一性」の dedup キーとしてのみ使用し、レスポンス/Supporter型には
  // 一切載せない（PII 保護・CLAUDE.md D）。1000行サイレントキャップ対策で range + order('id')。
  type SupporterVote = VoteWithVoterPro & { normalized_email: string | null }
  const supportersRaw: SupporterVote[] = []
  {
    const PAGE = 1000
    let from = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase.from('votes')
        .select('id, created_at, display_mode, client_photo_url, auth_display_name, voter_professional_id, normalized_email')
        .eq('professional_id', proId).eq('status', 'confirmed')
        .in('display_mode', ['photo', 'pro_link'])
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) break
      const rows = (data || []) as SupporterVote[]
      supportersRaw.push(...rows)
      if (rows.length < PAGE) break
      from += PAGE
    }
  }

  // (a) comments 用 voter_pro
  const commentsVoterProIds = Array.from(new Set(
    commentsRaw
      .map(c => c.voter_professional_id)
      .filter((id): id is string => !!id)
  ))
  const commentsVoterProsMap = new Map<string, VoterPro>()
  if (commentsVoterProIds.length > 0) {
    const { data } = await supabase
      .from('professionals')
      .select('id, name, title, photo_url')
      .in('id', commentsVoterProIds)
      .is('deactivated_at', null)
    for (const p of (data || []) as VoterPro[]) {
      commentsVoterProsMap.set(p.id, p)
    }
  }

  // (b) supporters 用 voter_pro
  const supportersVoterProIds = Array.from(new Set(
    supportersRaw
      .filter(v => v.display_mode === 'pro_link')
      .map(v => v.voter_professional_id)
      .filter((id): id is string => !!id)
  ))
  const supportersVoterProsMap = new Map<string, VoterPro>()
  if (supportersVoterProIds.length > 0) {
    const { data } = await supabase
      .from('professionals')
      .select('id, name, title, photo_url')
      .in('id', supportersVoterProIds)
      .is('deactivated_at', null)
    for (const p of (data || []) as VoterPro[]) {
      supportersVoterProsMap.set(p.id, p)
    }
  }

  // === Phase 3 Step 3: vote_replies を一括取得（is_deleted=false のみ） ===
  const commentedVoteIds = commentsRaw.map(c => c.id)
  const replyMap = new Map<string, VoiceReply>()
  if (commentedVoteIds.length > 0) {
    const { data: replies } = await supabase
      .from('vote_replies')
      .select('id, vote_id, reply_text, created_at, updated_at, delivered_at, delivered_via')
      .in('vote_id', commentedVoteIds)
      .eq('is_deleted', false)
    for (const r of (replies || []) as Array<VoiceReply & { vote_id: string }>) {
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

  // === Phase 3: proof_items の id → label（本文・長い方）マップ（既存取得済み proofItemsResult を流用） ===
  const itemLabelMap: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const item of (proofItemsResult.data || []) as any[]) {
    if (item?.id && item?.label) itemLabelMap[item.id] = item.label
  }

  // === enrichedComments: 機密フィールドを除外し voter_pro / reply を付与 ===
  const enrichedComments: EnrichedComment[] = commentsRaw.map(c => {
    const info = c.normalized_email ? voterInfoMap[c.normalized_email] : undefined
    const isFirstVote = info && info.firstVoteId === c.id
    let voterVoteCount = 1
    if (info && !isFirstVote) {
      voterVoteCount = getVoterLevel(info)
    }
    const voter_pro = c.voter_professional_id
      ? commentsVoterProsMap.get(c.voter_professional_id) || null
      : null

    // Phase 3: 事実タグ。selected_proof_ids → proof_items.label（本文・長い方）。
    // 強み本文の重複排除・最大3件（universal も含めて全カテゴリ表示）。
    // 空/NULL・custom_xxx（マスタに無い）なら空配列（エラーにしない）。
    const proofIds = Array.isArray(c.selected_proof_ids) ? c.selected_proof_ids : []
    const proofTags: string[] = []
    const seenLabel = new Set<string>()
    for (const pid of proofIds) {
      const label = itemLabelMap[pid]
      if (!label || seenLabel.has(label)) continue
      seenLabel.add(label)
      proofTags.push(label)
      if (proofTags.length >= 3) break
    }

    return {
      id: c.id,
      comment: c.comment,
      created_at: c.created_at,
      display_mode: c.display_mode,
      client_photo_url: c.client_photo_url,
      auth_display_name: c.auth_display_name,
      voter_pro,
      voter_vote_count: voterVoteCount,
      reply: replyMap.get(c.id) ?? null,
      proofTags,
    }
  })

  // === supporters 配列構築（写真URLが取得できるもの + 投票者単位で重複排除） ===
  // 同じお客さんが複数回投票しても顔は1つ。dedup キーは投票者の同一性:
  //   photo 票    → normalized_email
  //   pro_link 票 → voter_professional_id
  // created_at DESC で並べ「最新票」を代表として残す（旧: photo_url 単位だったため
  // 同一人物が別画像で投票すると別人扱いになり顔が重複していた）。
  // identity が取れない稀ケースは vote id で代替し、安全側（畳まない）に倒す。
  const supportersSorted = [...supportersRaw].sort((a, b) => {
    const t = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    return t !== 0 ? t : b.id.localeCompare(a.id)
  })
  const supporters: Supporter[] = []
  const seenVoters = new Set<string>()
  for (const v of supportersSorted) {
    if (v.display_mode === 'photo') {
      if (!v.client_photo_url) continue
      const identity = v.normalized_email ? `email:${v.normalized_email}` : `vote:${v.id}`
      if (seenVoters.has(identity)) continue
      seenVoters.add(identity)
      supporters.push({
        vote_id: v.id,
        photo_url: v.client_photo_url,
        display_name: v.auth_display_name || '',
        is_pro: false,
        created_at: v.created_at,
      })
    } else if (v.display_mode === 'pro_link') {
      if (!v.voter_professional_id) continue
      const voterPro = supportersVoterProsMap.get(v.voter_professional_id)
      if (!voterPro?.photo_url) continue
      const identity = `pro:${v.voter_professional_id}`
      if (seenVoters.has(identity)) continue
      seenVoters.add(identity)
      supporters.push({
        vote_id: v.id,
        photo_url: voterPro.photo_url,
        display_name: voterPro.name,
        is_pro: true,
        created_at: v.created_at,
        linkHref: `/card/${voterPro.id}`,
      })
    }
  }

  return {
    pro: proResult.data,
    voteSummary: voteSummaryResult.data || [],
    proofItems: proofItemsResult.data || [],
    personalitySummary: personalitySummaryResult.data || [],
    personalityItems: personalityItemsResult.data || [],
    comments: enrichedComments,
    supporters,
    menus: (menusResult.data || []) as ProMenu[],
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
  }
}
