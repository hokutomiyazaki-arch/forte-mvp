/**
 * §16-8 + §16-14（CEO決定・2026-08-06）+ §16-12 + §16-20: 停止中プロの公開カード(/card/[id])に出す
 * 「代理案内」候補の動的抽出。
 *
 * §16-14で絞り込み方法が「質問ゼロ」に上書きされたため、訪問者には何も質問しない。
 * §16-20（CEO決定・2026-08-06）: 案内先のソースは2種類。
 *   - mode='org' : 団体からの自動抽出(founder/instructor限定・最大4名)。以下の抽出ルール。
 *   - mode='list': 本人が作った紹介リストから固定の顔ぶれ(全プロ利用可・最大3名=リスト自体の上限)。
 * mode未指定(既存データ)は後方互換として'org'として扱う。
 *
 * 抽出ルール(§16-14・mode='org'):
 *   1. 停止中プロ本人のTOP3(vote_summaryのvote_count降順)
 *   2. 同団体の受付中メンバーから、TOP3のいずれかで実績がある人を集める
 *   3. 該当が少なければ同カテゴリ(proof_items.tab・9分類)まで広げる
 *   4. 最終プルーフ日(vote_type='proof' AND status='confirmed'のcreated_at最大値)が新しい順に最大4名
 *   5. min_support_records(DISTINCT人数)の下限を適用
 *
 * mode='list'の抽出ルール(§16-20):
 *   1. 指定リストの承諾済み(consent_status='approved')メンバーを取得
 *   2. 受付中(open)のメンバーのみに絞る・退会者(deactivated_at)を除外
 *   3. min_support_recordsは適用しない(本人が名指しで選んでいるため)
 *   4. リストの表示順(sort_order)で並べる(最大3名=リスト自体の上限)
 *   5. 本人所有(owner_id===自分)のリストであることを検証する
 *
 * fail-soft必須: professionals.delegate_criteria 未作成(42703等)の本番でもカードページ全体を
 * 落とさずnullを返す(select('*')経由で読むため通常はundefinedになるだけで例外は起きないが、
 * org_members.growth_role等の他カラム欠落も含めて広く保護する)。
 *
 * N+1対策: 団体メンバーをorg_membersで先に絞ってから、そのメンバー集合だけをvote_summary/votes
 * へ1クエリでin()する設計。FNT規模(認定者160名・votes数千件)を前提に、professionals全件走査は
 * しない。votesの1000行キャップ対策として .range()+.order('id') でページネーションする。
 */

import { getSupabaseAdmin } from '@/lib/supabase'
import { getDistinctSupporterCounts } from '@/lib/referral-data'
import { isAcceptingOpen } from '@/lib/referral-accepting'
import { TAB_DISPLAY_NAMES } from '@/lib/constants'
import { selectInChunks } from '@/lib/supabase-batch'

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>

const MAX_CANDIDATES = 4
const TOP_STRENGTHS_LIMIT = 3
/** §16-20: 自作リストの上限(リスト自体の上限=3名)に合わせる */
const MAX_LIST_CANDIDATES = 3

export interface DelegateCriteria {
  enabled?: boolean
  mode?: 'org' | 'list'
  org_id?: string | null
  list_id?: string | null
  min_support_records?: number | null
}

export interface DelegateCandidatePro {
  proId: string
  name: string
  photoUrl: string | null
  title: string | null
  prefecture: string | null
  /** TOP3項目のうち一致したものの本文ラベル。項目一致が無く同カテゴリのみの場合はカテゴリ名(9分類の表示名)。
   * mode='list'では「一致」の概念が無いため常に空配列。 */
  matchedProofLabels: string[]
  lastProofAt: string | null
}

export interface DelegateCandidatesResult {
  /** §16-20: 案内元が団体か自作リストか。フロント側の文言・検索窓の出し分けに使う。 */
  source: 'org' | 'list'
  /** §16-15: 「他のお悩みで探す」検索窓の検索範囲(団体内限定)をフロントに渡すために追加。
   * source='list'ではnull(団体スコープが無いため検索窓自体を出さない)。 */
  orgId: string | null
  orgName: string | null
  candidates: DelegateCandidatePro[]
}

interface PausedProInput {
  id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delegate_criteria?: any
}

/** 最終プルーフ日(vote_type='proof' AND status='confirmed'のcreated_at最大値)。
 * org/list両モードで共通のため1箇所に集約する(同じ判定ロジックを2箇所に書かない)。
 * memberIdsは既に絞り込んだ小集合が前提だが、CLAUDE.mdの規律に合わせ.range()+.order('id')で
 * 防御的にページネーションする。 */
async function getLastProofDates(
  supabase: SupabaseAdmin,
  memberIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (memberIds.length === 0) return result
  const PAGE = 1000
  let from = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('votes')
      .select('id, professional_id, created_at')
      .in('professional_id', memberIds)
      .eq('vote_type', 'proof')
      .eq('status', 'confirmed')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) break
    const rows = (data || []) as Array<{ professional_id: string; created_at: string }>
    for (const row of rows) {
      const current = result.get(row.professional_id)
      if (!current || row.created_at > current) result.set(row.professional_id, row.created_at)
    }
    if (rows.length < PAGE) break
    from += PAGE
  }
  return result
}

/** §16-20: mode='list'の抽出(本人の自作リストから固定の顔ぶれ)。 */
async function getDelegateCandidatesFromList(
  supabase: SupabaseAdmin,
  pausedProId: string,
  criteria: DelegateCriteria
): Promise<DelegateCandidatesResult | null> {
  const listId = criteria.list_id
  if (!listId) return null

  // 本人所有・共有可能(private以外)であることを検証(他人のリストを指定できないようにする)
  const { data: list } = await supabase
    .from('referral_lists')
    .select('id, title, owner_id, visibility')
    .eq('id', listId)
    .maybeSingle()
  if (!list || list.owner_id !== pausedProId || list.visibility === 'private') return null

  const { data: itemRows } = await supabase
    .from('referral_list_items')
    .select('pro_id, sort_order')
    .eq('list_id', listId)
    .eq('consent_status', 'approved')
  const items = ((itemRows || []) as Array<{ pro_id: string; sort_order: number | null }>).filter(
    (r) => !!r.pro_id && r.pro_id !== pausedProId
  )
  if (items.length === 0) return null

  const proIds = Array.from(new Set(items.map((r) => r.pro_id)))
  const { data: memberPros } = await supabase
    .from('professionals')
    .select('id, name, title, photo_url, prefecture, accepting_status, deactivated_at')
    .in('id', proIds)
  const proMap = new Map(
    ((memberPros || []) as Array<{
      id: string
      name: string
      title: string | null
      photo_url: string | null
      prefecture: string | null
      accepting_status: string | null
      deactivated_at: string | null
    }>)
      .filter((p) => !p.deactivated_at && isAcceptingOpen(p.accepting_status))
      .map((p) => [p.id, p])
  )
  const orderByProId = new Map(items.map((r) => [r.pro_id, r.sort_order ?? 0]))
  const eligibleIds = Array.from(proMap.keys())
  if (eligibleIds.length === 0) return null

  const lastProofByMember = await getLastProofDates(supabase, eligibleIds)

  const candidates: DelegateCandidatePro[] = eligibleIds
    .map((id) => {
      const pro = proMap.get(id)
      if (!pro) return null
      return {
        proId: id,
        name: pro.name,
        photoUrl: pro.photo_url,
        title: pro.title,
        prefecture: pro.prefecture,
        matchedProofLabels: [],
        lastProofAt: lastProofByMember.get(id) || null,
      }
    })
    .filter((c): c is DelegateCandidatePro => !!c)
    // §16-20: リストの表示順(sort_order)を優先する(本人が名指しで並べた順)
    .sort((a, b) => (orderByProId.get(a.proId) ?? 0) - (orderByProId.get(b.proId) ?? 0))
    .slice(0, MAX_LIST_CANDIDATES)

  if (candidates.length === 0) return null

  return { source: 'list', orgId: null, orgName: null, candidates }
}

export async function getDelegateCandidates(
  supabase: SupabaseAdmin,
  pausedPro: PausedProInput
): Promise<DelegateCandidatesResult | null> {
  try {
    const criteria = pausedPro?.delegate_criteria as DelegateCriteria | null | undefined
    if (!criteria || criteria.enabled !== true) return null

    // §16-20: mode未指定(既存データ)は後方互換として'org'として扱う
    const mode: 'org' | 'list' = criteria.mode === 'list' ? 'list' : 'org'
    if (mode === 'list') {
      return await getDelegateCandidatesFromList(supabase, pausedPro.id, criteria)
    }
    if (!criteria.org_id) return null

    const { data: org } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', criteria.org_id)
      .maybeSingle()
    if (!org) return null

    // 停止中プロ本人の実際に評価された強みTOP3(自己申告のselected_proof_idsではなく
    // vote_summaryのvote_count降順。referral-data.tsのgetProSupportStatsと同じ判定基準)
    const { data: ownSummary } = await supabase
      .from('vote_summary')
      .select('proof_id, vote_count')
      .eq('professional_id', pausedPro.id)
    const ownRows = (ownSummary || []) as Array<{ proof_id: string; vote_count: number }>
    if (ownRows.length === 0) return null

    const topProofIds = [...ownRows]
      .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
      .slice(0, TOP_STRENGTHS_LIMIT)
      .map((r) => r.proof_id)
    if (topProofIds.length === 0) return null

    // proof_items: label・tab(9分類)。TOP3項目のラベル + 同カテゴリ判定に全件必要
    const { data: proofItems } = await supabase.from('proof_items').select('id, label, tab')
    const itemsById = new Map<string, { label: string; tab: string | null }>()
    for (const item of (proofItems || []) as Array<{ id: string; label: string; tab: string | null }>) {
      if (item?.id) itemsById.set(item.id, { label: item.label, tab: item.tab ?? null })
    }

    const topLabelByProofId = new Map<string, string>()
    const topTabs = new Set<string>()
    for (const pid of topProofIds) {
      const item = itemsById.get(pid)
      if (!item) continue
      topLabelByProofId.set(pid, item.label)
      if (item.tab) topTabs.add(item.tab)
    }
    if (topLabelByProofId.size === 0) return null

    // 同じ団体のメンバー(本人除く)。まずorg_membersで絞る(N+1対策・votes全件走査を避ける)
    const { data: memberRows } = await supabase
      .from('org_members')
      .select('professional_id')
      .eq('organization_id', criteria.org_id)
      .eq('status', 'active')
      .is('removed_at', null)
      .not('professional_id', 'is', null)
    const memberIds = Array.from(
      new Set(
        ((memberRows || []) as Array<{ professional_id: string | null }>)
          .map((m) => m.professional_id)
          .filter((id): id is string => !!id && id !== pausedPro.id)
      )
    )
    if (memberIds.length === 0) return null

    // 真因対応(2026-08): memberIdsが100件を超える団体・vote_summary行数が1000超の団体で
    // 無音truncateしないよう、共通ヘルパー(IN句100件チャンク+range()ページネーション)で全件取得する。
    const memberPros = await selectInChunks<{
      id: string
      name: string
      title: string | null
      photo_url: string | null
      prefecture: string | null
      accepting_status: string | null
      deactivated_at: string | null
    }>(
      memberIds,
      (chunkIds, from, to) =>
        supabase
          .from('professionals')
          .select('id, name, title, photo_url, prefecture, accepting_status, deactivated_at')
          .in('id', chunkIds)
          .order('id', { ascending: true })
          .range(from, to)
    )
    const openMembers = memberPros.filter((p) => !p.deactivated_at && isAcceptingOpen(p.accepting_status))
    if (openMembers.length === 0) return null
    const openMemberIds = openMembers.map((p) => p.id)

    // メンバー全員のvote_summaryを1クエリで取得しJS側で集計(N+1回避)
    // vote_summaryはVIEWで id カラムが無いため、決定的順序は professional_id, proof_id の複合キーで代替する。
    const memberSummaryRows = await selectInChunks<{
      professional_id: string
      proof_id: string
      vote_count: number
    }>(
      openMemberIds,
      (chunkIds, from, to) =>
        supabase
          .from('vote_summary')
          .select('professional_id, proof_id, vote_count')
          .in('professional_id', chunkIds)
          .gt('vote_count', 0)
          .order('professional_id', { ascending: true })
          .order('proof_id', { ascending: true })
          .range(from, to)
    )
    const summaryByMember = new Map<string, Array<{ proof_id: string; vote_count: number }>>()
    for (const row of memberSummaryRows) {
      if (!summaryByMember.has(row.professional_id)) summaryByMember.set(row.professional_id, [])
      summaryByMember.get(row.professional_id)!.push(row)
    }

    const matchLabelsFor = (proId: string): string[] => {
      const rows = summaryByMember.get(proId) || []
      const labels: string[] = []
      const seen = new Set<string>()
      for (const row of rows) {
        const label = topLabelByProofId.get(row.proof_id)
        if (label && !seen.has(label)) {
          seen.add(label)
          labels.push(label)
        }
      }
      return labels
    }

    const hasCategoryMatch = (proId: string): boolean => {
      const rows = summaryByMember.get(proId) || []
      return rows.some((row) => {
        const item = itemsById.get(row.proof_id)
        return !!item?.tab && topTabs.has(item.tab)
      })
    }

    // ① 項目一致(TOP3のいずれかで実績がある) → ② 該当が少なければ同カテゴリまで広げる(§16-14)
    const itemMatchedIds = openMemberIds.filter((id) => matchLabelsFor(id).length > 0)
    let matchedIds = itemMatchedIds
    if (matchedIds.length < MAX_CANDIDATES) {
      const itemMatchedSet = new Set(itemMatchedIds)
      const categoryMatchedIds = openMemberIds.filter((id) => !itemMatchedSet.has(id) && hasCategoryMatch(id))
      if (categoryMatchedIds.length > 0) matchedIds = [...itemMatchedIds, ...categoryMatchedIds]
    }
    if (matchedIds.length === 0) return null

    // min_support_records(DISTINCT人数)の下限適用(referral-data.tsのfindCriteriaMatchesと
    // 同じ判定基準を共有・二重実装しない)
    const minSupport = typeof criteria.min_support_records === 'number' ? criteria.min_support_records : null
    let eligibleIds = matchedIds
    if (minSupport !== null) {
      const counts = await getDistinctSupporterCounts(supabase, matchedIds)
      eligibleIds = matchedIds.filter((id) => (counts[id] || 0) >= minSupport)
    }
    if (eligibleIds.length === 0) return null

    // 最終プルーフ日(vote_type='proof' AND status='confirmed'のcreated_at最大値)。
    // eligibleIds(既に団体メンバーの一部)のみへin()するため1000行キャップに達する想定はないが、
    // CLAUDE.mdの規律に合わせ.range()+.order('id')で防御的にページネーションする(getLastProofDatesに集約)。
    const lastProofByMember = await getLastProofDates(supabase, eligibleIds)

    const proMap = new Map(openMembers.map((p) => [p.id, p]))
    const categoryFallbackLabels = Array.from(topTabs).map((t) => TAB_DISPLAY_NAMES[t] || t)

    const candidates: DelegateCandidatePro[] = eligibleIds
      .map((id) => {
        const pro = proMap.get(id)
        if (!pro) return null
        const matchedProofLabels = matchLabelsFor(id)
        return {
          proId: id,
          name: pro.name,
          photoUrl: pro.photo_url,
          title: pro.title,
          prefecture: pro.prefecture,
          matchedProofLabels: matchedProofLabels.length > 0 ? matchedProofLabels : categoryFallbackLabels,
          lastProofAt: lastProofByMember.get(id) || null,
        }
      })
      .filter((c): c is DelegateCandidatePro => !!c)
      // §16-14: 最終プルーフ日が新しい順(一致数順にしない=上位固定を避ける)。日付無しは最後尾。
      .sort((a, b) => {
        if (!a.lastProofAt && !b.lastProofAt) return 0
        if (!a.lastProofAt) return 1
        if (!b.lastProofAt) return -1
        return b.lastProofAt.localeCompare(a.lastProofAt)
      })
      .slice(0, MAX_CANDIDATES)

    if (candidates.length === 0) return null

    return { source: 'org', orgId: org.id, orgName: org.name, candidates }
  } catch (e) {
    // fail-soft(§16-14): delegate_criteria等未作成の本番でもカードページ全体を落とさない
    console.error('getDelegateCandidates error (fail-soft, returning null):', e)
    return null
  }
}
