/**
 * Weekly Proof Report — データ集計ロジック
 *
 * 全プロのパーソナライズされた週次レポートデータを集計する。
 * 褒めパターン判定（8パターン）+ テンプレート適用まで行う。
 */

import { getSupabaseAdmin } from '@/lib/supabase'
import { clerkClient } from '@clerk/nextjs/server'
import { PROVEN_THRESHOLD, SPECIALIST_THRESHOLD } from '@/lib/constants'

const MASTER_THRESHOLD = 50

// ============================================================
// 型定義
// ============================================================

export type PraisePattern =
  | 'starting'  // 0票
  | 'stalled'   // 2週以上新規0票 & 累計4票以上
  | 'proven'    // 今週PROVEN達成
  | 'growing'   // 今週+3票以上
  | 'almost'    // 12〜14票
  | 'focused'   // 1項目に50%以上集中
  | 'diverse'   // 3項目以上に均等分布
  | 'first'     // 累計1〜3票 / フォールバック

export interface WeeklyProData {
  professional_id: string
  name: string
  title: string
  contact_email: string | null
  line_messaging_user_id: string | null
  weekly_report_unsubscribed: boolean

  // 数値カード
  new_proofs_this_week: number
  total_proofs: number
  top_strength_label: string
  proven_count: number
  total_selected_items: number

  // PROVEN進捗（上位3項目）
  proof_progress: Array<{
    strength_label: string
    current_votes: number
    is_proven: boolean
    next_milestone: number
    remaining: number
  }>

  // カテゴリ統計
  top_category_stat: {
    strength_label: string
    total_platform_votes: number
    pro_votes: number
    percent: number
  } | null

  // コメント
  latest_comment: string | null

  // 褒めパターン判定結果
  praise_pattern: PraisePattern
  praise_variables: {
    profession: string
    strength: string
    number: string
    percent: string
  }
  praise_message: string
}

export interface WeeklyReportContent {
  highlight_text: string | null
  tips_text: string | null
}

// ============================================================
// 日付ユーティリティ
// ============================================================

/** 今週月曜00:00 JST を UTC Date として返す */
function getWeekStartJST(date: Date = new Date()): Date {
  const jstOffset = 9 * 60 * 60 * 1000
  const jstDate = new Date(date.getTime() + jstOffset)
  const day = jstDate.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  jstDate.setUTCDate(jstDate.getUTCDate() + diff)
  jstDate.setUTCHours(0, 0, 0, 0)
  return new Date(jstDate.getTime() - jstOffset)
}

/** 次のマイルストーン（15→30→50）を返す */
function getNextMilestone(votes: number): number {
  if (votes < PROVEN_THRESHOLD) return PROVEN_THRESHOLD
  if (votes < SPECIALIST_THRESHOLD) return SPECIALIST_THRESHOLD
  return MASTER_THRESHOLD
}

// ============================================================
// 褒めパターン判定
// ============================================================

function determinePraisePattern(
  totalVoteCount: number,
  lastVoteDate: Date | null,
  weeklyItemGains: Map<string, number>,
  allTimeItemVotes: Map<string, number>,
  title: string,
  proofItemLabels: Map<string, string>,
): { pattern: PraisePattern; variables: { profession: string; strength: string; number: string; percent: string } } {

  const twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  // ★ 最優先: 0. starting: 累計0票
  if (totalVoteCount === 0) {
    return {
      pattern: 'starting',
      variables: { profession: title, strength: '', number: '0', percent: '' },
    }
  }

  // ★ 0.5. stalled: 2週以上新規0票 かつ 累計4票以上
  if (totalVoteCount >= 4 && lastVoteDate && lastVoteDate < twoWeeksAgo) {
    return {
      pattern: 'stalled',
      variables: { profession: title, strength: '', number: String(totalVoteCount), percent: '' },
    }
  }

  // 1. PROVEN達成: 今週15票に到達した項目がある
  const allTimeEntries = Array.from(allTimeItemVotes.entries())
  let provenResult: ReturnType<typeof determinePraisePattern> | null = null
  allTimeEntries.forEach(([itemId, currentVotes]) => {
    if (provenResult) return
    if (currentVotes >= PROVEN_THRESHOLD) {
      const weeklyGain = weeklyItemGains.get(itemId) || 0
      const prevWeekVotes = currentVotes - weeklyGain
      if (prevWeekVotes < PROVEN_THRESHOLD && weeklyGain > 0) {
        provenResult = {
          pattern: 'proven',
          variables: {
            profession: title,
            strength: proofItemLabels.get(itemId) || '',
            number: String(currentVotes),
            percent: '',
          },
        }
      }
    }
  })
  if (provenResult) return provenResult

  // 2. 急成長: 今週の最大増加が +3票以上
  let maxGainItem = ''
  let maxGain = 0
  Array.from(weeklyItemGains.entries()).forEach(([itemId, gain]) => {
    if (gain > maxGain) {
      maxGain = gain
      maxGainItem = itemId
    }
  })
  if (maxGain >= 3) {
    return {
      pattern: 'growing',
      variables: {
        profession: title,
        strength: proofItemLabels.get(maxGainItem) || '',
        number: String(maxGain),
        percent: '',
      },
    }
  }

  // 3. もうすぐPROVEN: 12〜14票の項目がある
  let almostResult: ReturnType<typeof determinePraisePattern> | null = null
  allTimeEntries.forEach(([itemId, votes]) => {
    if (almostResult) return
    if (votes >= 12 && votes < PROVEN_THRESHOLD) {
      const remaining = PROVEN_THRESHOLD - votes
      almostResult = {
        pattern: 'almost',
        variables: {
          profession: title,
          strength: proofItemLabels.get(itemId) || '',
          number: String(remaining),
          percent: '',
        },
      }
    }
  })
  if (almostResult) return almostResult

  // 4. 集中型: 1つの項目に全投票の50%以上が集中
  const totalWeighted = Array.from(allTimeItemVotes.values()).reduce((a, b) => a + b, 0)
  let focusedResult: ReturnType<typeof determinePraisePattern> | null = null
  if (totalWeighted > 0) {
    allTimeEntries.forEach(([itemId, votes]) => {
      if (focusedResult) return
      const pct = Math.round((votes / totalWeighted) * 100)
      if (pct >= 50) {
        focusedResult = {
          pattern: 'focused',
          variables: {
            profession: title,
            strength: proofItemLabels.get(itemId) || '',
            number: String(votes),
            percent: String(pct),
          },
        }
      }
    })
  }
  if (focusedResult) return focusedResult

  // 5. 多面型: 3つ以上の項目に均等に票（最大と最小の差が2倍以内）
  const votedItems = Array.from(allTimeItemVotes.entries()).filter(([, v]) => v > 0)
  if (votedItems.length >= 3) {
    const sorted = votedItems.map(([, v]) => v).sort((a, b) => a - b)
    const minVotes = sorted[0]
    const maxVotes = sorted[sorted.length - 1]
    if (minVotes > 0 && maxVotes <= minVotes * 2) {
      return {
        pattern: 'diverse',
        variables: {
          profession: title,
          strength: '',
          number: String(votedItems.length),
          percent: '',
        },
      }
    }
  }

  // 6. 初動: 累計1〜3票
  if (totalVoteCount >= 1 && totalVoteCount <= 3) {
    return {
      pattern: 'first',
      variables: {
        profession: title,
        strength: '',
        number: String(totalVoteCount),
        percent: '',
      },
    }
  }

  // フォールバック: first
  return {
    pattern: 'first',
    variables: {
      profession: title,
      strength: '',
      number: String(totalVoteCount),
      percent: '',
    },
  }
}

// ============================================================
// テンプレート適用
// ============================================================

function buildPraiseMessage(
  templatesByPattern: Map<string, string[]>,
  pattern: PraisePattern,
  variables: { profession: string; strength: string; number: string; percent: string },
): string {
  const templates = templatesByPattern.get(pattern) || []
  if (templates.length === 0) {
    return `${variables.profession}として、あなたのプルーフは成長しています。`
  }
  const template = templates[Math.floor(Math.random() * templates.length)]
  return template
    .replace(/\{profession\}/g, variables.profession)
    .replace(/\{strength\}/g, variables.strength)
    .replace(/\{number\}/g, variables.number)
    .replace(/\{percent\}/g, variables.percent)
}

// ============================================================
// Weekly Report Content 取得
// ============================================================

export async function getWeeklyReportContent(weekStart: string): Promise<WeeklyReportContent | null> {
  const supabase = getSupabaseAdmin()

  // 指定週のコンテンツを取得
  const { data } = await supabase
    .from('weekly_report_content')
    .select('highlight_text, tips_text')
    .eq('week_start', weekStart)
    .eq('is_active', true)
    .maybeSingle()

  if (data) return data

  // フォールバック: 最新のアクティブコンテンツ
  const { data: latest } = await supabase
    .from('weekly_report_content')
    .select('highlight_text, tips_text')
    .eq('is_active', true)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  return latest || null
}

// ============================================================
// メイン: 全プロの WeeklyProData 一括生成
// ============================================================

export async function generateAllWeeklyReports(): Promise<WeeklyProData[]> {
  const supabase = getSupabaseAdmin()

  // 日付範囲
  const now = new Date()
  const weekStart = getWeekStartJST(now)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  // ── 6並列クエリ ──
  const [
    prosRes,
    voteSummaryRes,
    weeklyVotesRes,
    proofItemsRes,
    allVotesRes,
    praiseRes,
  ] = await Promise.all([
    // 1. アクティブなプロ全員（user_id含む: Clerkメール取得用）
    supabase
      .from('professionals')
      .select('id, user_id, name, last_name, first_name, title, contact_email, line_messaging_user_id, selected_proofs, weekly_report_unsubscribed')
      .is('deactivated_at', null),
    // 2. 全期間の投票サマリー（weighted / per-item）
    supabase
      .from('vote_summary')
      .select('professional_id, proof_id, vote_count'),
    // 3. 今週の投票（comment含む / 新しい順）
    supabase
      .from('votes')
      .select('professional_id, selected_proof_ids, session_count, comment, created_at')
      .eq('vote_type', 'proof')
      .eq('status', 'confirmed')
      .gte('created_at', weekStart.toISOString())
      .lt('created_at', weekEnd.toISOString())
      .order('created_at', { ascending: false }),
    // 4. proof_items（ラベル取得）
    supabase
      .from('proof_items')
      .select('id, label, strength_label, tab'),
    // 5. 全期間の投票（total count + 最新投票日特定用）
    supabase
      .from('votes')
      .select('professional_id, created_at')
      .eq('vote_type', 'proof')
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false }),
    // 6. 褒めテンプレート（全件）
    supabase
      .from('praise_templates')
      .select('pattern_type, template_text'),
  ])

  const professionals = prosRes.data || []
  const voteSummary = voteSummaryRes.data || []
  const weeklyVotes = weeklyVotesRes.data || []
  const proofItems = proofItemsRes.data || []
  const allVotes = allVotesRes.data || []
  const praiseTemplates = praiseRes.data || []

  // ── マップ構築 ──

  // proof_items: id → strength_label
  const proofItemLabels = new Map<string, string>()
  proofItems.forEach((item: any) => {
    proofItemLabels.set(item.id, item.strength_label)
  })

  // vote_summary → プロ別 → { proof_id → weighted vote_count }
  const allTimeByPro = new Map<string, Map<string, number>>()
  voteSummary.forEach((row: any) => {
    if (!allTimeByPro.has(row.professional_id)) {
      allTimeByPro.set(row.professional_id, new Map())
    }
    allTimeByPro.get(row.professional_id)!.set(row.proof_id, row.vote_count)
  })

  // 今週の投票 → プロ別 → { proof_id → weighted gain }
  const weeklyByPro = new Map<string, Map<string, number>>()
  const weeklyCommentsByPro = new Map<string, string>()
  const weeklyVoteCountByPro = new Map<string, number>()

  weeklyVotes.forEach((vote: any) => {
    const proId = vote.professional_id
    const weight = vote.session_count === 'repeat' ? 2 : 1
    const proofIds: string[] = vote.selected_proof_ids || []

    // 投票件数（raw count, 非weighted）
    weeklyVoteCountByPro.set(proId, (weeklyVoteCountByPro.get(proId) || 0) + 1)

    // per-item weighted
    if (!weeklyByPro.has(proId)) weeklyByPro.set(proId, new Map())
    const proMap = weeklyByPro.get(proId)!
    proofIds.forEach((pid: string) => {
      proMap.set(pid, (proMap.get(pid) || 0) + weight)
    })

    // 最新コメント（order by created_at desc なので最初が最新）
    if (vote.comment && !weeklyCommentsByPro.has(proId)) {
      weeklyCommentsByPro.set(proId, vote.comment)
    }
  })

  // 全期間 → プロ別の総投票数 & 最新投票日
  const totalVoteCountByPro = new Map<string, number>()
  const lastVoteDateByPro = new Map<string, Date>()

  allVotes.forEach((vote: any) => {
    const proId = vote.professional_id
    totalVoteCountByPro.set(proId, (totalVoteCountByPro.get(proId) || 0) + 1)
    // order by desc なので最初が最新
    if (!lastVoteDateByPro.has(proId)) {
      lastVoteDateByPro.set(proId, new Date(vote.created_at))
    }
  })

  // プラットフォーム全体のproof_id別投票合計
  const platformTotals = new Map<string, number>()
  voteSummary.forEach((row: any) => {
    platformTotals.set(row.proof_id, (platformTotals.get(row.proof_id) || 0) + row.vote_count)
  })

  // 褒めテンプレート → パターン別に配列化
  const templatesByPattern = new Map<string, string[]>()
  praiseTemplates.forEach((t: any) => {
    if (!templatesByPattern.has(t.pattern_type)) {
      templatesByPattern.set(t.pattern_type, [])
    }
    templatesByPattern.get(t.pattern_type)!.push(t.template_text)
  })

  // ── Clerk Backend API でプロのメールアドレスを一括取得 ──
  // contact_email はクライアント向け公開連絡先なので、通知先としては不適切。
  // Clerk に登録されたメールを優先し、なければ contact_email をフォールバック。
  const clerkEmailByProId = new Map<string, string>()
  try {
    const clerk = await clerkClient()
    const userIds = professionals
      .map(p => p.user_id as string)
      .filter(Boolean)

    // Clerk getUserList は最大100件ずつ → バッチ分割
    for (let i = 0; i < userIds.length; i += 100) {
      const batch = userIds.slice(i, i + 100)
      const clerkUsers = await clerk.users.getUserList({
        userId: batch,
        limit: 100,
      })
      for (const u of clerkUsers.data) {
        const email = u.emailAddresses?.[0]?.emailAddress
        if (email) {
          // userId → proId のマッピング
          const pro = professionals.find(p => p.user_id === u.id)
          if (pro) {
            clerkEmailByProId.set(pro.id as string, email)
          }
        }
      }
    }
    console.log(`[weekly-report] Clerk batch: ${clerkEmailByProId.size} emails resolved from ${userIds.length} userIds`)
  } catch (err) {
    console.error('[weekly-report] Clerk API error, falling back to contact_email:', err)
  }

  // ── 各プロの WeeklyProData を組み立て ──

  const results: WeeklyProData[] = []

  for (const pro of professionals) {
    const proId = pro.id as string
    const name = (pro.last_name && pro.first_name)
      ? `${pro.last_name} ${pro.first_name}`
      : (pro.name || '—')
    const title = pro.title || 'プロフェッショナル'

    // All-time per-item weighted votes
    const allTimeItems = allTimeByPro.get(proId) || new Map<string, number>()
    // Weekly per-item weighted gains
    const weeklyItems = weeklyByPro.get(proId) || new Map<string, number>()

    // 総投票数（raw count）
    const totalVoteCount = totalVoteCountByPro.get(proId) || 0
    // 今週の投票数（raw count）
    const newProofsThisWeek = weeklyVoteCountByPro.get(proId) || 0

    // トップ項目（最多 weighted votes）
    let topItemId = ''
    let topItemVotes = 0
    allTimeItems.forEach((votes, itemId) => {
      if (votes > topItemVotes) {
        topItemVotes = votes
        topItemId = itemId
      }
    })
    const topStrengthLabel = proofItemLabels.get(topItemId) || '—'

    // PROVEN達成項目数
    let provenCount = 0
    allTimeItems.forEach(v => { if (v >= PROVEN_THRESHOLD) provenCount++ })

    // プロの選択中項目数
    const selectedProofs: string[] = (pro.selected_proofs as string[]) || []
    const totalSelectedItems = selectedProofs.length

    // PROVEN進捗（上位3項目 by weighted votes）
    const sortedItems = Array.from(allTimeItems.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)

    const proofProgress = sortedItems.map(([itemId, votes]) => {
      const isProven = votes >= PROVEN_THRESHOLD
      const nextMilestone = getNextMilestone(votes)
      return {
        strength_label: proofItemLabels.get(itemId) || '—',
        current_votes: votes,
        is_proven: isProven,
        next_milestone: nextMilestone,
        remaining: Math.max(0, nextMilestone - votes),
      }
    })

    // カテゴリ統計（トップ項目のプラットフォーム内シェア）
    let topCategoryStat: WeeklyProData['top_category_stat'] = null
    if (topItemId && topItemVotes > 0) {
      const platformTotal = platformTotals.get(topItemId) || 0
      const percent = platformTotal > 0 ? Math.round((topItemVotes / platformTotal) * 100) : 0
      topCategoryStat = {
        strength_label: topStrengthLabel,
        total_platform_votes: platformTotal,
        pro_votes: topItemVotes,
        percent,
      }
    }

    // 最新コメント（今週分）
    const latestComment = weeklyCommentsByPro.get(proId) || null

    // 最終投票日
    const lastVoteDate = lastVoteDateByPro.get(proId) || null

    // 褒めパターン判定
    const { pattern, variables } = determinePraisePattern(
      totalVoteCount,
      lastVoteDate,
      weeklyItems,
      allTimeItems,
      title,
      proofItemLabels,
    )

    // テンプレート適用
    const praiseMessage = buildPraiseMessage(templatesByPattern, pattern, variables)

    results.push({
      professional_id: proId,
      name,
      title,
      contact_email: clerkEmailByProId.get(proId) || (pro.contact_email as string) || null,
      line_messaging_user_id: (pro.line_messaging_user_id as string) || null,
      weekly_report_unsubscribed: !!(pro.weekly_report_unsubscribed),
      new_proofs_this_week: newProofsThisWeek,
      total_proofs: totalVoteCount,
      top_strength_label: topStrengthLabel,
      proven_count: provenCount,
      total_selected_items: totalSelectedItems,
      proof_progress: proofProgress,
      top_category_stat: topCategoryStat,
      latest_comment: latestComment,
      praise_pattern: pattern,
      praise_variables: variables,
      praise_message: praiseMessage,
    })
  }

  return results
}
