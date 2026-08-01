/**
 * §4 クライアント向け処方箋ページ (/r/[slug]) のデータ取得。
 *
 * 既存の src/lib/card-data.ts の流儀（Server Componentから直接呼ぶ集約関数・
 * getSupabaseAdmin・.maybeSingle()）を踏襲する。
 *
 * PII注意: normalized_email / voter_email / 電話番号は一切レスポンスに含めない。
 */

import { getSupabaseAdmin } from '@/lib/supabase'
import { sanitizeVoiceForReferral } from '@/lib/voice-sanitize'

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
  acceptingStatus: 'open' | 'conditional' | 'closed' | null
  /** 'conditional' のときのみ値あり */
  acceptingNote: string | null
  /** accepting_status === 'closed' */
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
  accepting_status: 'open' | 'conditional' | 'closed' | null
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
  const [summaryResult, votesResult] = await Promise.all([
    supabase.from('vote_summary').select('proof_id, vote_count').eq('professional_id', proId),
    supabase
      .from('votes')
      .select('normalized_email, created_at')
      .eq('professional_id', proId)
      .eq('vote_type', 'proof')
      .eq('status', 'confirmed')
      .order('created_at', { ascending: true }),
  ])

  const strengths = ((summaryResult.data || []) as Array<{ proof_id: string; vote_count: number }>)
    .map((row) => ({ label: itemLabelMap[row.proof_id], count: row.vote_count || 0 }))
    .filter((s): s is { label: string; count: number } => !!s.label)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  const votes = (votesResult.data || []) as Array<{ normalized_email: string | null; created_at: string }>
  const emails = new Set<string>()
  for (const v of votes) {
    if (v.normalized_email) emails.add(v.normalized_email)
  }

  return {
    strengths,
    supporterCount: emails.size,
    firstRecordedAt: votes.length > 0 ? votes[0].created_at : null,
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

  const excerpts: string[] = []
  for (const v of (data || []) as Array<{ id: string; comment: string }>) {
    if (excerpts.length >= VOICE_EXCERPT_LIMIT) break
    const sanitized = await sanitizeVoiceForReferral(v.id, v.comment)
    if (sanitized) excerpts.push(sanitized)
  }
  return excerpts
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

  const isPaused = pro.accepting_status === 'closed'

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
    acceptingNote: pro.accepting_status === 'conditional' ? pro.accepting_note : null,
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
    if (candidate) results.push(candidate)
  }
  return results
}

interface Criteria {
  org_id?: string | null
  themes?: string[]
  min_support_records?: number
  requires_reassessment?: boolean
  area?: { prefecture?: string; radius_km?: number }
  accepting_only?: boolean
}

/**
 * 基準行（criteria）に合致するプロを探索する。Phase 1 最小実装:
 *   - accepting_only → accepting_status IN ('open','conditional')
 *   - area.prefecture → 完全一致（radius_kmは未対応）
 *   - min_support_records → 確認済みプルーフのユニーク人数の下限
 * §2-2: accepting_status='closed' のプロは常に静かに除外する（accepting_onlyの値に関わらず）。
 */
async function findCriteriaMatches(
  supabase: SupabaseAdmin,
  criteria: Criteria,
  itemLabelMap: Record<string, string>,
  excludeProIds: string[],
  limit: number
): Promise<string[]> {
  let query = supabase
    .from('professionals')
    .select('id')
    .is('deactivated_at', null)
    .neq('accepting_status', 'closed')

  if (criteria.accepting_only) {
    query = query.in('accepting_status', ['open', 'conditional'])
  }
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

  const statsList = await Promise.all(
    candidates.map((c) => getProSupportStats(supabase, c.id, itemLabelMap))
  )

  const scored = candidates
    .map((c, i) => ({ id: c.id, supporterCount: statsList[i].supporterCount }))
    .filter((c) => minSupport === null || c.supporterCount >= minSupport)
    .sort((a, b) => b.supporterCount - a.supporterCount)

  return scored.slice(0, limit).map((s) => s.id)
}

/**
 * /r/[slug] の全データを取得する。
 * - slugが見つからない、または visibility='private' の場合は null（ページ側で404）
 * - 送り手(オーナー)が非公開化済みの場合も null
 */
export async function getReferralPageData(slug: string): Promise<ReferralPageData | null> {
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
      itemLabelMap,
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
    list: { title: list.title, comment: list.comment, slug: list.slug },
    sender: { id: owner.id, name: owner.name, title: owner.title, photoUrl: owner.photo_url },
    candidates,
  }
}
