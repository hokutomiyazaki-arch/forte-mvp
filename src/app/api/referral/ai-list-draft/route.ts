import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'
import { isReferralEnabled, isReferralAiListEnabled } from '@/lib/feature-flags'
import { computeReferralSignal } from '@/lib/referral-accepting'
import { fetchSearchAggregates } from '@/lib/supabase-batch'
import { parseListIntent, pickCandidates, isAnthropicConfigured, CandidateInput } from '@/lib/referral-ai-list'
import { TAB_DISPLAY_NAMES } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/**
 * POST /api/referral/ai-list-draft
 * 自由文からAIが候補プロ最大3人+推薦理由のドラフトを返す(DB書き込みは一切しない)。
 * body: { prompt: string }
 *
 * 個人情報保護: レスポンス・Anthropicへのpayloadのどちらにも
 * voter_email / normalized_email / voter_phone / client_email 等は含めない。
 */

// モジュールスコープのin-memory cooldown(proIdごと20秒)。連打時は429。
const COOLDOWN_MS = 20 * 1000
const lastRequestAt = new Map<string, number>()

const CANDIDATE_FETCH_CAP = 500
const TOP_N_FOR_AI = 20
const COMMENT_PER_PRO = 3
const COMMENT_MAX_LEN = 120

interface ScoredCandidate {
  id: string
  name: string
  title: string | null
  prefecture: string | null
  totalProofs: number
  score: number
  topStrengthLabels: string[]
}

export async function POST(request: NextRequest) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!isReferralEnabled(ownPro.id) || !isReferralAiListEnabled(ownPro.id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt || prompt.length > 200) {
      return NextResponse.json({ error: 'invalid_prompt' }, { status: 400 })
    }

    const now = Date.now()
    const last = lastRequestAt.get(ownPro.id) || 0
    if (now - last < COOLDOWN_MS) {
      return NextResponse.json({ error: 'cooldown' }, { status: 429 })
    }
    lastRequestAt.set(ownPro.id, now)

    if (!isAnthropicConfigured()) {
      return NextResponse.json({ error: 'ai_unavailable' }, { status: 503 })
    }

    const supabase = getSupabaseAdmin()

    const intent = await parseListIntent(prompt)

    // 候補プロの取得。deactivated除外・selected_proofs未設定除外・自分自身除外。
    // intentに都道府県があれば絞る。最大500件(.order('id')+.range()でSupabaseの1000行
    // サイレントキャップを回避)。
    let proQuery = supabase
      .from('professionals')
      .select('id, name, title, prefecture, selected_proofs, accepting_status, delegate_list_id')
      .is('deactivated_at', null)
      .not('selected_proofs', 'is', null)
      .neq('id', ownPro.id)
      .order('id', { ascending: true })
      .range(0, CANDIDATE_FETCH_CAP - 1)

    if (intent?.prefecture) {
      proQuery = proQuery.eq('prefecture', intent.prefecture)
    }

    const { data: professionalsData, error: proError } = await proQuery
    if (proError) {
      console.error('[api/referral/ai-list-draft] professionals fetch error:', proError)
      return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    }

    const professionals = professionalsData || []

    // 受付シグナル: computeReferralSignal(status, false)が'open'(🟢)のプロのみ。
    // 第2引数を固定falseにするのは§16-7と同じ判定(🟡代理は紹介リストの候補にしない)。
    const openPros = professionals.filter(
      (p: any) => computeReferralSignal(p.accepting_status, false) === 'open'
    )

    if (openPros.length === 0) {
      return NextResponse.json({ draft: { title: '', comment: '', candidates: [], foundCount: 0 } })
    }

    const proIds = openPros.map((p: any) => p.id)
    const aggregates = await fetchSearchAggregates(supabase, proIds)
    if (!aggregates) {
      // RPC失敗時はJSフォールバックをしない(ドラフト生成機能のため、失敗時は落として良い仕様)
      return NextResponse.json({ error: 'aggregates_unavailable' }, { status: 502 })
    }

    const { data: proofItemsData } = await supabase.from('proof_items').select('id, tab, strength_label')
    const itemTabMap: Record<string, string> = {}
    const itemLabelMap: Record<string, string> = {}
    ;(proofItemsData || []).forEach((item: any) => {
      if (!item?.id) return
      if (item.tab) itemTabMap[item.id] = item.tab
      if (item.strength_label) itemLabelMap[item.id] = item.strength_label
    })

    const keywordsLower: string[] = (intent?.keywords || []).map((k) => k.toLowerCase())

    // total_proofs>=1のプロのみ残し、intentのキーワード/カテゴリと集計タブ・強み項目のマッチ数で
    // 単純スコアリングする(target es5のため、Map/Setはfor..ofでなくforEach/.get()を使う)。
    const scored: ScoredCandidate[] = []
    openPros.forEach((pro: any) => {
      const agg = aggregates.get(pro.id)
      const totalProofs = agg?.total_proofs || 0
      if (totalProofs < 1) return

      const itemVoteCounts = agg?.item_vote_counts || {}
      const strengthEntries: Array<{ id: string; count: number }> = []
      Object.keys(itemVoteCounts).forEach((itemId) => {
        strengthEntries.push({ id: itemId, count: itemVoteCounts[itemId] || 0 })
      })
      strengthEntries.sort((a, b) => b.count - a.count)

      const topStrengthLabels: string[] = []
      strengthEntries.slice(0, 5).forEach((e) => {
        const label = itemLabelMap[e.id]
        if (label) topStrengthLabels.push(label)
      })

      let score = 0
      if (keywordsLower.length > 0) {
        strengthEntries.forEach((e) => {
          if (e.count <= 0) return
          const label = itemLabelMap[e.id] || ''
          const tabName = TAB_DISPLAY_NAMES[itemTabMap[e.id] || ''] || ''
          const haystack = (label + ' ' + tabName).toLowerCase()
          const matched = keywordsLower.some((kw) => !!kw && haystack.indexOf(kw) !== -1)
          if (matched) score += 1
        })
        const latestCommentLower = (agg?.latest_comment || '').toLowerCase()
        keywordsLower.forEach((kw) => {
          if (kw && latestCommentLower.indexOf(kw) !== -1) score += 1
        })
      }

      scored.push({
        id: pro.id,
        name: pro.name,
        title: pro.title || null,
        prefecture: pro.prefecture || null,
        totalProofs,
        score,
        topStrengthLabels,
      })
    })

    if (scored.length === 0) {
      return NextResponse.json({ draft: { title: '', comment: '', candidates: [], foundCount: 0 } })
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.totalProofs - a.totalProofs
    })

    const top20 = scored.slice(0, TOP_N_FOR_AI)
    const top20Ids = top20.map((s) => s.id)

    // 上位20人分のコメント抜粋(最新3件×各120字・vote_type確認済み・comment非空・削除系除外)。
    // PII(voter_email等)は選択しない。
    const commentsByPro: Record<string, string[]> = {}
    if (top20Ids.length > 0) {
      const { data: voteRows } = await supabase
        .from('votes')
        .select('professional_id, comment, created_at')
        .in('professional_id', top20Ids)
        .eq('status', 'confirmed')
        .in('vote_type', ['proof', 'continuation'])
        .not('comment', 'is', null)
        .neq('comment', '')
        .neq('comment', '[deleted]')
        .order('created_at', { ascending: false })
        .limit(top20Ids.length * 20)

      ;(voteRows || []).forEach((row: any) => {
        if (!row.professional_id || !row.comment) return
        if (!commentsByPro[row.professional_id]) commentsByPro[row.professional_id] = []
        const list = commentsByPro[row.professional_id]
        if (list.length >= COMMENT_PER_PRO) return
        list.push(String(row.comment).slice(0, COMMENT_MAX_LEN))
      })
    }

    const candidateInputs: CandidateInput[] = top20.map((s) => ({
      pro_id: s.id,
      name: s.name,
      title: s.title,
      prefecture: s.prefecture,
      total_proofs: s.totalProofs,
      top_strengths: s.topStrengthLabels,
      comment_excerpts: commentsByPro[s.id] || [],
    }))

    const pickResult = await pickCandidates(intent, candidateInputs)
    if (!pickResult) {
      return NextResponse.json({ error: 'ai_unavailable' }, { status: 503 })
    }

    const byId: Record<string, ScoredCandidate> = {}
    top20.forEach((s) => {
      byId[s.id] = s
    })

    const candidates: Array<{
      pro_id: string
      name: string
      title: string | null
      prefecture: string | null
      total_proofs: number
      reason: string
    }> = []
    pickResult.picks.forEach((pick) => {
      const s = byId[pick.pro_id]
      if (!s) return
      candidates.push({
        pro_id: s.id,
        name: s.name,
        title: s.title,
        prefecture: s.prefecture,
        total_proofs: s.totalProofs,
        reason: pick.reason,
      })
    })

    return NextResponse.json({
      draft: {
        title: pickResult.title,
        comment: pickResult.comment,
        candidates,
        foundCount: candidates.length,
      },
    })
  } catch (err: any) {
    console.error('[api/referral/ai-list-draft] POST error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
