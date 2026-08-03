/**
 * §4 クライアント向け処方箋ページ (/r/[slug]) のデータ取得。
 *
 * 既存の src/lib/card-data.ts の流儀（Server Componentから直接呼ぶ集約関数・
 * getSupabaseAdmin・.maybeSingle()）を踏襲する。
 *
 * PII注意: normalized_email / voter_email / 電話番号は一切レスポンスに含めない。
 */

import { cache } from 'react'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sanitizeVoiceForReferral } from '@/lib/voice-sanitize'
import { isAcceptingOpen } from '@/lib/referral-accepting'

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>

/** 合計提示の上限（§2-1: クライアントへの提示は合計2〜4名まで） */
const MAX_TOTAL_CANDIDATES = 4
/** 基準行の絞り込み候補プール上限（Phase 1 最小実装。全件走査はしない） */
const CRITERIA_POOL_LIMIT = 30
/** Voice抜粋の表示件数上限 */
const VOICE_EXCERPT_LIMIT = 2

export interface ReferralCandidatePro {
  id: string
  name: string
  title: string | null
  photoUrl: string | null
  prefecture: string | null
  isOnlineAvailable: boolean
}

export interface ReferralCandidate {
  pro: ReferralCandidatePro
  /** ピン指名かどうか（false = 基準行による自動生成） */
  isPinned: boolean
  /** 送り手からの一言（ピンのみ・基準行はnull） */
  note: string | null
  acceptingStatus: 'open' | 'closed' | null
  /** isAcceptingOpen()がtrueの間だけ値あり（fail-open現仕様: NULL/未設定も含めstatus!=='closed'なら表示） */
  acceptingNote: string | null
  /** 受付停止中（!isAcceptingOpen: fail-open現仕様につき status==='closed' の時のみtrue。NULL/想定外の値は受付中扱い） */
  isPaused: boolean
  /** 一段だけの代理候補（ピンが受付停止中 かつ delegate_list_id 設定時のみ） */
  delegate: ReferralCandidate[] | null
  /** 人数上位の強み2〜3件（人数はDISTINCT集計・vote_summary準拠） */
  strengths: { label: string; count: number }[]
  /** 確認済みプルーフを残したユニーク人数 */
  supporterCount: number
  /** 最初の確認済みプルーフの記録日時（ISO。無ければnull） */
  firstRecordedAt: string | null
  /** AI変換済み（フラグoff時は原文）のVoice抜粋、最大2件 */
  voiceExcerpts: string[]
}

export interface ReferralPageData {
  list: {
    id: string
    title: string
    /** 選定基準の説明（送り手が語るのは基準のみ） */
    comment: string | null
    slug: string
  }
  sender: {
    id: string
    name: string
    title: string | null
    photoUrl: string | null
  }
  candidates: ReferralCandidate[]
}

interface ProfessionalRow {
  id: string
  name: string
  title: string | null
  photo_url: string | null
  prefecture: string | null
  is_online_available: boolean | null
  service_formats: string[] | null
  accepting_status: 'open' | 'closed' | null
  accepting_note: string | null
  delegate_list_id: string | null
  deactivated_at: string | null
}

interface SupportStats {
  strengths: { label: string; count: number }[]
  supporterCount: number
  firstRecordedAt: string | null
}

async function getItemLabelMap(supabase: SupabaseAdmin): Promise<Record<string, string>> {
  const { data } = await supabase.from('proof_items').select('id, label')
  const map: Record<string, string> = {}
  for (const item of (data || []) as Array<{ id: string; label: string }>) {
    if (item?.id && item?.label) map[item.id] = item.label
  }
  return map
}

async function getProSupportStats(
  supabase: SupabaseAdmin,
  proId: string,
  itemLabelMap: Record<string, string>
): Promise<SupportStats> {
  const [summaryResult, firstVoteResult] = await Promise.all([
    supabase.from('vote_summary').select('proof_id, vote_count').eq('professional_id', proId),
    // firstRecordedAt は1行だけ欲しいので軽量な単独クエリに分離(全件走査には含めない)
    supabase
      .from('votes')
      .select('created_at')
      .eq('professional_id', proId)
      .eq('vote_type', 'proof')
      .eq('status', 'confirmed')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const strengths = ((summaryResult.data || []) as Array<{ proof_id: string; vote_count: number }>)
    .map((row) => ({ label: itemLabelMap[row.proof_id], count: row.vote_count || 0 }))
    .filter((s): s is { label: string; count: number } => !!s.label)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  // supporterCount: Supabaseの1000行サイレントキャップ対策で .range() + .order('id') により全件走査する
  const emails = new Set<string>()
  const PAGE = 1000
  let from = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('votes')
      .select('id, normalized_email')
      .eq('professional_id', proId)
      .eq('vote_type', 'proof')
      .eq('status', 'confirmed')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) break
    const rows = (data || []) as Array<{ normalized_email: string | null }>
    for (const v of rows) {
      if (v.normalized_email) emails.add(v.normalized_email)
    }
    if (rows.length < PAGE) break
    from += PAGE
  }

  return {
    strengths,
    supporterCount: emails.size,
    firstRecordedAt: (firstVoteResult.data as { created_at: string } | null)?.created_at ?? null,
  }
}

async function getVoiceExcerpts(supabase: SupabaseAdmin, proId: string): Promise<string[]> {
  const { data } = await supabase
    .from('votes')
    .select('id, comment, created_at')
    .eq('professional_id', proId)
    .eq('status', 'confirmed')
    .not('comment', 'is', null)
    .neq('comment', '')
    .neq('comment', '[deleted]')
    .order('created_at', { ascending: false })
    .limit(VOICE_EXCERPT_LIMIT * 3) // 変換後に禁止語で弾かれる分の余裕

  const rows = (data || []) as Array<{ id: string; comment: string }>
  // 直列awaitだと候補数に比例してレイテンシが積み上がるため並列化する
  const sanitized = await Promise.all(rows.map((v) => sanitizeVoiceForReferral(v.id, v.comment)))
  return sanitized.filter((s): s is string => !!s).slice(0, VOICE_EXCERPT_LIMIT)
}

interface BuildCandidateOptions {
  isPinned: boolean
  note: string | null
  /** false の場合、この候補自身が受付停止中でも代理候補の展開を行わない（一段のみ制御） */
  allowDelegateExpansion: boolean
}

async function buildCandidate(
  supabase: SupabaseAdmin,
  proId: string,
  itemLabelMap: Record<string, string>,
  options: BuildCandidateOptions
): Promise<ReferralCandidate | null> {
  const { data: proData } = await supabase
    .from('professionals')
    .select(
      'id, name, title, photo_url, prefecture, is_online_available, service_formats, accepting_status, accepting_note, delegate_list_id, deactivated_at'
    )
    .eq('id', proId)
    .maybeSingle()

  const pro = proData as ProfessionalRow | null
  if (!pro || pro.deactivated_at) return null

  // §2-2改訂: 2値のうちopen以外は全てclosed扱い(fail safe)
  const isPaused = !isAcceptingOpen(pro.accepting_status)

  const [stats, voiceExcerpts] = await Promise.all([
    getProSupportStats(supabase, proId, itemLabelMap),
    getVoiceExcerpts(supabase, proId),
  ])

  let delegate: ReferralCandidate[] | null = null
  if (options.isPinned && isPaused && options.allowDelegateExpansion && pro.delegate_list_id) {
    delegate = await buildDelegateCandidates(supabase, pro.delegate_list_id, itemLabelMap)
  }

  return {
    pro: {
      id: pro.id,
      name: pro.name,
      title: pro.title,
      photoUrl: pro.photo_url,
      prefecture: pro.prefecture,
      isOnlineAvailable: !!(pro.service_formats?.includes('online') || pro.is_online_available),
    },
    isPinned: options.isPinned,
    note: options.note,
    acceptingStatus: pro.accepting_status,
    acceptingNote: isAcceptingOpen(pro.accepting_status) ? pro.accepting_note : null,
    isPaused,
    delegate,
    strengths: stats.strengths,
    supporterCount: stats.supporterCount,
    firstRecordedAt: stats.firstRecordedAt,
    voiceExcerpts,
  }
}

/** 代理リストを一段だけ展開する（§2-2: 再帰しない）。 */
async function buildDelegateCandidates(
  supabase: SupabaseAdmin,
  delegateListId: string,
  itemLabelMap: Record<string, string>
): Promise<ReferralCandidate[]> {
  const { data: items } = await supabase
    .from('referral_list_items')
    .select('pro_id, note, sort_order, consent_status')
    .eq('list_id', delegateListId)
    .eq('consent_status', 'approved')
    .order('sort_order', { ascending: true })

  const results: ReferralCandidate[] = []
  for (const item of (items || []) as Array<{ pro_id: string; note: string | null }>) {
    const candidate = await buildCandidate(supabase, item.pro_id, itemLabelMap, {
      isPinned: true,
      note: item.note,
      allowDelegateExpansion: false, // 一段のみ・再帰しない
    })
    // §2-2改訂(CEO決定・空約束の防止): 代理として展開するのは受付中(open)のメンバーのみ。
    // consent_status='approved'であっても本人が停止中なら、代理として案内する意味がないため除外する。
    if (candidate && !candidate.isPaused) results.push(candidate)
  }
  return results
}

export interface Criteria {
  org_id?: string | null
  themes?: string[]
  min_support_records?: number
  requires_reassessment?: boolean
  area?: { prefecture?: string; radius_km?: number }
  accepting_only?: boolean
}

/**
 * min_support_records 判定・スコアリングの基準（CEO決定・§B）:
 * 「ユニーク人数」= DISTINCT normalized_email（vote_type='proof' AND status='confirmed'）。
 * 強み集計のDISTINCT化（§2-8）と同じ原則に統一する。
 *
 * プール内の複数プロ分をまとめて1回のページネーション走査で集計する
 * （votes は1000行サイレントキャップがあるため .range()+.order('id') 必須）。
 * 表示側(findCriteriaMatchesの並び順)・検証側(verifyReceiverAllowedInList)の
 * 両方から呼び、二重実装しない。
 */
async function getDistinctSupporterCounts(
  supabase: SupabaseAdmin,
  proIds: string[]
): Promise<Record<string, number>> {
  if (proIds.length === 0) return {}

  const emailSetsByPro: Record<string, Set<string>> = {}
  const PAGE = 1000
  let from = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('votes')
      .select('id, professional_id, normalized_email')
      .in('professional_id', proIds)
      .eq('vote_type', 'proof')
      .eq('status', 'confirmed')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) break
    const rows = (data || []) as Array<{ professional_id: string; normalized_email: string | null }>
    for (const row of rows) {
      if (!row.normalized_email) continue
      if (!emailSetsByPro[row.professional_id]) emailSetsByPro[row.professional_id] = new Set()
      emailSetsByPro[row.professional_id].add(row.normalized_email)
    }
    if (rows.length < PAGE) break
    from += PAGE
  }

  const counts: Record<string, number> = {}
  for (const [proId, emails] of Object.entries(emailSetsByPro)) {
    counts[proId] = emails.size
  }
  return counts
}

/**
 * 基準行（criteria）に合致するプロを探索する。Phase 1 最小実装:
 *   - accepting_only → accepting_status が 'closed' でない(NULL含む・fail-open)
 *   - area.prefecture → 完全一致（radius_kmは未対応）
 *   - min_support_records → ユニーク人数（DISTINCT normalized_email）の下限。
 *     指定時のみ votes をページネーション走査して算出する（軽量パス維持のため未指定時はこのクエリ自体を実行しない）
 * §2-2改訂(先行テスト第3弾・fail-open): accepting_status='closed' のプロのみ常に静かに除外する
 * (NULLはopenとして含める。accepting_onlyの値に関わらず)。
 */
async function findCriteriaMatches(
  supabase: SupabaseAdmin,
  criteria: Criteria,
  excludeProIds: string[],
  limit: number
): Promise<string[]> {
  // §2-2改訂: 2値化により「常に除外」と「accepting_onlyのみ絞る」が同一条件になったため、
  // ベースクエリで一度だけ「closedでない」を条件にする(accepting_onlyの値に関わらず結果は変わらない)。
  let query = supabase
    .from('professionals')
    .select('id')
    .is('deactivated_at', null)
    .or('accepting_status.is.null,accepting_status.neq.closed')

  if (criteria.area?.prefecture) {
    query = query.eq('prefecture', criteria.area.prefecture)
  }

  const { data: pool } = await query
    .order('accepting_updated_at', { ascending: false })
    .limit(CRITERIA_POOL_LIMIT)

  // 除外(送り手本人・既ピン)はJS側で行う。PostgRESTの .not('id','in',...) は
  // excludeProIds が空配列のとき `()` になり不正クエリになるedge caseがあるため
  // （既存 popup-suggestion/route.ts と同じ回避方針）。
  const excludeSet = new Set(excludeProIds)
  const candidates = ((pool || []) as Array<{ id: string }>).filter((c) => !excludeSet.has(c.id))
  if (candidates.length === 0) return []

  const minSupport =
    typeof criteria.min_support_records === 'number' ? criteria.min_support_records : null

  // min_support_records未指定なら、プール取得クエリの順序(accepting_updated_at desc)のまま返す
  // (votesの追加走査をしない軽量パス維持)
  if (minSupport === null) {
    return candidates.slice(0, limit).map((c) => c.id)
  }

  const supporterCounts = await getDistinctSupporterCounts(
    supabase,
    candidates.map((c) => c.id)
  )

  const scored = candidates
    .map((c) => ({ id: c.id, supporterCount: supporterCounts[c.id] || 0 }))
    .filter((c) => c.supporterCount >= minSupport)
    .sort((a, b) => b.supporterCount - a.supporterCount)

  return scored.slice(0, limit).map((s) => s.id)
}

/**
 * §2-1: 代理リスト展開(delegate)を含めた最終提示数が合計 MAX_TOTAL_CANDIDATES を
 * 超えないようキャップする(トップレベルの件数だけでなく delegate 展開後のフラット件数)。
 */
function capCandidatesTotal(candidates: ReferralCandidate[], max: number): ReferralCandidate[] {
  let remaining = max
  const result: ReferralCandidate[] = []
  for (const c of candidates) {
    if (remaining <= 0) break
    if (c.delegate && c.delegate.length > 0) {
      const delegateBudget = Math.max(0, remaining - 1)
      const trimmedDelegate = c.delegate.slice(0, delegateBudget)
      result.push({ ...c, delegate: trimmedDelegate.length > 0 ? trimmedDelegate : null })
      remaining -= 1 + trimmedDelegate.length
    } else {
      result.push(c)
      remaining -= 1
    }
  }
  return result
}

/**
 * /r/[slug] の全データを取得する。
 * - slugが見つからない、または visibility='private' の場合は null（ページ側で404）
 * - 送り手(オーナー)が非公開化済みの場合も null
 *
 * React.cache() でラップし、同一リクエスト内(generateMetadata + 本体)での
 * 二重実行(Voice sanitize/DB問い合わせの重複)を防ぐ。
 */
export const getReferralPageData = cache(async function getReferralPageData(
  slug: string
): Promise<ReferralPageData | null> {
  if (!slug) return null

  const supabase = getSupabaseAdmin()

  const { data: list } = await supabase
    .from('referral_lists')
    .select('id, owner_id, title, comment, visibility, criteria, slug, is_delegate')
    .eq('slug', slug)
    .maybeSingle()

  if (!list || list.visibility === 'private') return null

  const { data: ownerData } = await supabase
    .from('professionals')
    .select('id, name, title, photo_url, deactivated_at')
    .eq('id', list.owner_id)
    .maybeSingle()

  const owner = ownerData as
    | { id: string; name: string; title: string | null; photo_url: string | null; deactivated_at: string | null }
    | null
  if (!owner || owner.deactivated_at) return null

  const itemLabelMap = await getItemLabelMap(supabase)

  const { data: pinnedItemsRaw } = await supabase
    .from('referral_list_items')
    .select('pro_id, note, sort_order, consent_status')
    .eq('list_id', list.id)
    .eq('consent_status', 'approved')
    .order('sort_order', { ascending: true })

  const pinnedItems = (pinnedItemsRaw || []) as Array<{ pro_id: string; note: string | null }>

  const candidates: ReferralCandidate[] = []
  for (const item of pinnedItems) {
    const candidate = await buildCandidate(supabase, item.pro_id, itemLabelMap, {
      isPinned: true,
      note: item.note,
      allowDelegateExpansion: true,
    })
    if (candidate) candidates.push(candidate)
  }

  const remainingSlots = Math.max(0, MAX_TOTAL_CANDIDATES - candidates.length)
  if (remainingSlots > 0 && list.criteria && typeof list.criteria === 'object') {
    const excludeIds = [owner.id, ...pinnedItems.map((i) => i.pro_id)]
    const matchIds = await findCriteriaMatches(
      supabase,
      list.criteria as Criteria,
      excludeIds,
      remainingSlots
    )
    for (const proId of matchIds) {
      const candidate = await buildCandidate(supabase, proId, itemLabelMap, {
        isPinned: false,
        note: null,
        allowDelegateExpansion: false,
      })
      if (candidate) candidates.push(candidate)
    }
  }

  return {
    list: { id: list.id, title: list.title, comment: list.comment, slug: list.slug },
    sender: { id: owner.id, name: owner.name, title: owner.title, photoUrl: owner.photo_url },
    candidates: capCandidatesTotal(candidates, MAX_TOTAL_CANDIDATES),
  }
})

/**
 * POST /api/referral/bookings 用の軽量な受け手検証。
 * getReferralPageData() を丸ごと呼ぶと Voice sanitize / 強み集計まで全て走ってしまうため、
 * 「このリストからこの受け手を予約してよいか」だけを確認する専用の軽量クエリ群に分離する。
 *   ① referral_list_items に approved で存在するか(自リストのピン)
 *   ② 無ければ criteria 判定(accepting/prefecture/min_support、いずれも軽量クエリ)
 *   ③ 停止中ピンの代理リスト(delegate_list_id)の approved item か
 */
export async function verifyReceiverAllowedInList(
  supabase: SupabaseAdmin,
  list: { id: string; criteria: unknown },
  receiverProId: string
): Promise<boolean> {
  // ① 自リストのピン(approved)
  const { data: pinnedItem } = await supabase
    .from('referral_list_items')
    .select('id')
    .eq('list_id', list.id)
    .eq('pro_id', receiverProId)
    .eq('consent_status', 'approved')
    .maybeSingle()
  if (pinnedItem) return true

  // ③ 停止中ピンの代理リストの approved item か
  const { data: pinnedRows } = await supabase
    .from('referral_list_items')
    .select('pro_id')
    .eq('list_id', list.id)
    .eq('consent_status', 'approved')
  const pinnedProIds = ((pinnedRows || []) as Array<{ pro_id: string }>).map((p) => p.pro_id)

  if (pinnedProIds.length > 0) {
    // §2-2改訂(先行テスト第3弾・fail-open): 「停止中」= accepting_status='closed' のみ
    // (NULLはopen扱いのため、代理展開の対象から除く。isAcceptingOpen()と厳密に等価)
    const { data: pausedPros } = await supabase
      .from('professionals')
      .select('delegate_list_id')
      .in('id', pinnedProIds)
      .eq('accepting_status', 'closed')
      .not('delegate_list_id', 'is', null)
    const delegateListIds = ((pausedPros || []) as Array<{ delegate_list_id: string | null }>)
      .map((p) => p.delegate_list_id)
      .filter((id): id is string => !!id)

    if (delegateListIds.length > 0) {
      const { data: delegateItem } = await supabase
        .from('referral_list_items')
        .select('id')
        .in('list_id', delegateListIds)
        .eq('pro_id', receiverProId)
        .eq('consent_status', 'approved')
        .maybeSingle()
      if (delegateItem) return true
    }
  }

  // ② criteria判定(軽量)
  const criteria = (list.criteria && typeof list.criteria === 'object' ? list.criteria : null) as Criteria | null
  if (!criteria) return false

  const { data: proData } = await supabase
    .from('professionals')
    .select('id, prefecture, accepting_status, deactivated_at')
    .eq('id', receiverProId)
    .maybeSingle()
  const pro = proData as
    | { id: string; prefecture: string | null; accepting_status: string | null; deactivated_at: string | null }
    | null
  if (!pro || pro.deactivated_at) return false
  // §2-2改訂(先行テスト第3弾・fail-open): accepting_status='closed' は criteria判定でも常に除外(NULLはopen扱い)
  if (!isAcceptingOpen(pro.accepting_status)) return false
  if (criteria.area?.prefecture && pro.prefecture !== criteria.area.prefecture) return false

  if (typeof criteria.min_support_records === 'number') {
    // CEO決定(§B): min_support_recordsはユニーク人数(DISTINCT normalized_email)で判定。
    // findCriteriaMatchesの並び順と同じ getDistinctSupporterCounts を共有する(二重実装しない)。
    const counts = await getDistinctSupporterCounts(supabase, [receiverProId])
    const supporterCount = counts[receiverProId] || 0
    if (supporterCount < criteria.min_support_records) return false
  }

  return true
}
