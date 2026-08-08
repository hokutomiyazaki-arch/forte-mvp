import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { isSearchPrivate, isReferralFullyLaunched } from '@/lib/feature-flags'
import { getViewerIsPro, getViewerIsProStrict } from '@/lib/viewer-role'
import { computeReferralSignal, isReferralReachable } from '@/lib/referral-accepting'
import { getValidDelegateListIds } from '@/lib/referral-delegate'
import { selectInChunks, fetchSearchAggregates, fetchVoiceMatches } from '@/lib/supabase-batch'

export const dynamic = 'force-dynamic'

// Wilson Score（90%信頼区間の下限値）
// 母数が少ないほど保守的な値を返す
function wilsonScore(successes: number, total: number): number {
  if (total === 0) return 0
  const z = 1.645 // 90%信頼区間
  const p = successes / total
  const numerator = p + (z * z) / (2 * total) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)
  const denominator = 1 + (z * z) / total
  return Math.max(0, numerator / denominator)
}

// Fisher-Yates（リロードごとにランダムな並びを返す）
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// CEO指示(2026-08-06・Pick up既定表示): 直近7日の確定済みproof投票が何件から
// 「急上昇」に載せるかの下限(内部運用値・UIには出さない)
const RISING_MIN_VOTES_7D = 3

// カテゴリタブ → DBのtab値のマッピング
const CATEGORY_TAB_MAP: Record<string, string[]> = {
  healing: ['healing'],
  body: ['body', 'bodymake'],
  bodymake: ['bodymake'],
  performance: ['performance'],
  mind: ['mind'],
  beauty: ['beauty'],
  nutrition: ['nutrition'],
  relax: ['relax'],
  skill: ['skill'],
}

// votes テーブルの全件ページネーション取得ヘルパー
// 真因対応(2026-08): 本ヘルパーは引数 proIds を受け取っていたのに一度もクエリに使っていなかった
// (`.in('professional_id', proIds)` が無い)ため、confirmed の votes を毎回全件スキャンしていた。
// proIds を実際にフィルタへ反映しつつ、①IN句を100件ずつチャンク分割 ②各チャンクを
// .range()+.order('id') でページネーション、の二重対策を共通ヘルパー(selectInChunks)に委譲する。
// 注意: 呼び出し側が created_at 順を要求する場合は、戻り値を JS 側でソートし直すこと(既存通り)。
async function fetchAllVotesPaginated(
  supabase: any,
  proIds: string[],
  selectCols: string,
  voteType: string | string[] | null
) {
  if (!proIds || proIds.length === 0) return []
  return selectInChunks<any>(proIds, (chunkIds, from, to) => {
    let q = supabase
      .from('votes')
      .select(selectCols)
      .eq('status', 'confirmed')
      .in('professional_id', chunkIds)
      .order('id', { ascending: true })
      .range(from, to)
    if (Array.isArray(voteType)) {
      q = q.in('vote_type', voteType)
    } else if (voteType) {
      q = q.eq('vote_type', voteType)
    }
    return q
  })
}

export async function GET(request: Request) {
  // §3-2 検索ページの非公開化: FEATURE_SEARCH_PRIVATE=true の時のみ、非プロのリクエストを403にする。
  // フラグ未設定時はこのブロックは素通りし、以降の処理は完全に既存通り。
  if (isSearchPrivate()) {
    const isPro = await getViewerIsPro()
    if (!isPro) {
      return NextResponse.json({ error: 'forbidden' }, {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
  }

  // §2-2改訂: 受付シグナルはプロ限定情報。非プロにはレスポンスにも含めない
  // (UIゲートだけだとDevToolsから🔴相当が読めてしまうため付与自体を絞る)。fail closed。
  const viewerIsProStrict = await getViewerIsProStrict()

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') || 'multi'
  const subCategory = searchParams.get('sub') || 'rising'
  const query = searchParams.get('q') || ''
  const prefecture = searchParams.get('prefecture') || ''

  const supabase = getSupabaseAdmin()

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    // X-Day対応(2026-08-08): 「今週の急上昇」用。JS集計パスでは集計ループ内で使う
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // 全アクティブプロを取得（プルーフ0除外はあとでフィルタ）
    // 真因対応(2026-08): .range() が無く、Supabase max-rows=1000 でプロ数が1000名を超えた
    // 時点で無音truncateする問題があった。ここではまず全件取得できるようページネーションする。
    // ただしプロ数が数万規模になれば全件メモリロード自体がボトルネックになる(Postgres側集計への
    // リファクタが将来必要)。無音破綻を避けるため、上限件数でキャップしログで検知できるようにする。
    const PROFESSIONALS_FETCH_CAP = 5000
    const professionals: any[] = []
    {
      let from = 0
      const pageSize = 1000
      while (true) {
        let proQuery = supabase
          .from('professionals')
          .select(`
            id, name, title, prefecture, area_description, bio,
            photo_url, selected_proofs,
            badge_rising, badge_specialist, badge_multi, badge_top,
            featured_vote_id, featured_proof_id, created_at,
            accepting_status, accepting_note, delegate_list_id
          `)
          .is('deactivated_at', null)
          .not('selected_proofs', 'is', null)
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1)

        if (prefecture) {
          proQuery = proQuery.eq('prefecture', prefecture)
        }

        const { data, error: prosError } = await proQuery
        if (prosError) throw prosError
        if (!data || data.length === 0) break
        professionals.push(...data)
        if (data.length < pageSize) break
        from += pageSize
        if (professionals.length >= PROFESSIONALS_FETCH_CAP) {
          console.error(
            `[api/search] professionals fetch cap (${PROFESSIONALS_FETCH_CAP}) reached - truncating results. ` +
            `Postgres側集計(RPC/VIEW)へのリファクタが必要な規模に到達した可能性あり。`
          )
          break
        }
      }
    }

    if (!professionals || professionals.length === 0) {
      return NextResponse.json({ professionals: [] }, {
        headers: { 'Cache-Control': 'no-store' }
      })
    }

    const proIds = professionals.map(p => p.id)

    // ============================================================
    // X-Day対応(2026-08-08・CEO GO): votes 全行を JS に運ぶのをやめ、プロ単位の集計だけを
    // RPC(migration 059)から受け取る。スコアリング・並び替えは従来どおり JS 側。
    // fail-soft: RPC 未作成・エラー時は null が返り、従来の votes 全件取得+JS集計へ
    // フォールバックする(検索は公開機能のため絶対に落とさない)。
    // q がある時はコメント検索RPCも必要で、どちらか一方でも失敗したら全面フォールバック
    // (半端な混在をしない)。
    // ============================================================
    const rpcAggregates = await fetchSearchAggregates(supabase, proIds)
    const rpcVoiceMatches = rpcAggregates && query ? await fetchVoiceMatches(supabase, proIds, query) : null
    const useRpc = !!rpcAggregates && (!query || !!rpcVoiceMatches)
    // レビュー指摘(中・観測性): fail-softは成功時に無音のため、どちらのパスで動いたかを
    // 必ず1行ログに残す(PIIなし)。SQL 059実行後の検証はVercelログでこの行を見る。
    console.log('[api/search] aggregation=%s (pros=%d)', useRpc ? 'rpc' : 'js', proIds.length)

    // 投票データを一括取得（プルーフ投票: スコア計算用）
    // 真因対応(2026-05-28): .limit(10000) は Supabase max-rows=1000 でキャップされる。
    // ヘルパーで全件ページネーション取得する。
    // §2-8: 累計プルーフには継続記録(vote_type='continuation')も算入する。
    // 注意: continuation行は selected_proof_ids/selected_personality_ids を保持したまま保存される
    // （「初めて」選択なのに過去票がある場合の再分類。§2-8「選択項目は行に保存、集計不算入」）。
    // そのため null 前提の除外はできず、下流の各集計ループ側で vote_type==='continuation' を
    // 明示的にスキップする必要がある（totalProofs/recentProofs/lastProofAt等の件数系は算入したまま）。
    // X-Day対応: RPC集計が取れた場合は votes 全件を取得しない(空配列で下流ループは全て素通り)。
    const proofVotes = useRpc
      ? []
      : await fetchAllVotesPaginated(
          supabase,
          proIds,
          'id, professional_id, created_at, vote_type, comment, normalized_email, selected_proof_ids, selected_personality_ids',
          ['proof', 'continuation']
        )

    // リピーター率用: 全投票のnormalized_email+session_countを取得（session_countフォールバック対応）
    // 真因対応(2026-05-28): .limit(10000) は Supabase max-rows=1000 でキャップされる。
    // ヘルパーで全件取得（ID順）→ 集計前に JS 側で created_at ASC ソートし直す。
    // ※ ソート必須: 下のリピーター集計ループは「最初に遭遇した票」を firstVoteId/
    //   firstSessionCount として保存するため、created_at の昇順=最古優先が前提。
    const allVotesForRepeater = useRpc
      ? []
      : await fetchAllVotesPaginated(
          supabase,
          proIds,
          'id, professional_id, normalized_email, session_count, created_at',
          null
        )
    allVotesForRepeater.sort(
      (a: any, b: any) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    // proof_items のtab情報を取得
    const { data: proofItems } = await supabase
      .from('proof_items')
      .select('id, tab, strength_label')

    const itemTabMap: Record<string, string> = {}
    const itemLabelMap: Record<string, string> = {}
    for (const item of proofItems || []) {
      itemTabMap[item.id] = item.tab
      if (item.strength_label) itemLabelMap[item.id] = item.strength_label
    }

    // featured_vote のコメント取得
    const featuredVoteIds = professionals
      .filter(p => p.featured_vote_id)
      .map(p => p.featured_vote_id!)

    let featuredVoteMap: Record<string, string> = {}
    if (featuredVoteIds.length > 0) {
      const { data: featuredVotes } = await supabase
        .from('votes')
        .select('id, comment')
        .in('id', featuredVoteIds)
      for (const v of featuredVotes || []) {
        if (v.comment) featuredVoteMap[v.id] = v.comment
      }
    }

    // personality_items テーブル（is_active=true のみ集計対象、category 含む）
    const { data: personalityItems } = await supabase
      .from('personality_items')
      .select('id, label, personality_label, category, is_active')

    const personalityLabelMap: Record<string, string> = {}
    const personalityPersonalityLabelMap: Record<string, string> = {}
    const personalityCategoryMap: Record<string, string> = {}
    const activePersonalityIds = new Set<string>()
    for (const item of personalityItems || []) {
      personalityLabelMap[item.id] = item.label
      personalityPersonalityLabelMap[item.id] = item.personality_label || item.label
      if (item.category) personalityCategoryMap[item.id] = item.category
      if (item.is_active !== false) activePersonalityIds.add(item.id)
    }

    // プロごとのパーソナリティ集計
    // §2-8: continuation行は selected_personality_ids を保持したまま保存されるため、
    // 明示的にスキップする（集計不算入はVIEW/集計側の責務）。
    const proPersonalityCounts = new Map<string, Record<string, number>>()
    for (const vote of proofVotes || []) {
      if (vote.vote_type === 'continuation') continue
      if (!vote.selected_personality_ids || vote.selected_personality_ids.length === 0) continue
      const pid = vote.professional_id
      if (!proPersonalityCounts.has(pid)) proPersonalityCounts.set(pid, {})
      const counts = proPersonalityCounts.get(pid)!
      for (const perId of vote.selected_personality_ids) {
        counts[perId] = (counts[perId] || 0) + 1
      }
    }
    // X-Day対応: RPC集計パスでは personality_counts(jsonb) をそのまま使う(定義は上のJSループと同一)
    if (useRpc && rpcAggregates) {
      rpcAggregates.forEach((agg, pid) => {
        if (agg.personality_counts && Object.keys(agg.personality_counts).length > 0) {
          proPersonalityCounts.set(pid, agg.personality_counts)
        }
      })
    }

    // 検索マッチング（voice + proof）
    const commentMatchProIds = new Set<string>()
    const voiceMatchMap: Record<string, string> = {} // proId -> matched comment snippet
    const proofMatchMap: Record<string, string> = {} // proId -> matched strength_label
    const voiceMatchCountMap: Record<string, number> = {} // proId -> マッチしたコメント件数
    // 前後20字の抜粋を作る共通処理(JS集計パス・RPCパスで同一の見た目にする)
    const buildVoiceExcerpt = (comment: string): string | null => {
      const idx = comment.indexOf(query)
      if (idx === -1) return null
      const start = Math.max(0, idx - 20)
      const end = Math.min(comment.length, idx + query.length + 20)
      const excerpt = comment.slice(start, end)
      const prefix = start > 0 ? '...' : ''
      const suffix = end < comment.length ? '...' : ''
      return prefix + excerpt + suffix
    }
    if (query && useRpc && rpcVoiceMatches && rpcAggregates) {
      // X-Day対応: コメント全文マッチはRPC(search_voice_matches・リテラル部分一致)の集計結果を使う
      rpcVoiceMatches.forEach((m, pid) => {
        commentMatchProIds.add(pid)
        voiceMatchCountMap[pid] = m.match_count
        if (m.first_comment) {
          const excerpt = buildVoiceExcerpt(m.first_comment)
          if (excerpt) voiceMatchMap[pid] = excerpt
        }
      })
      // proof マッチ: 「その項目に1票以上あるプロ」= item_voter_counts にキーが存在するプロ(JS版と等価)
      for (const item of proofItems || []) {
        if (item.strength_label && item.strength_label.includes(query)) {
          rpcAggregates.forEach((agg, pid) => {
            if (!proofMatchMap[pid] && agg.item_voter_counts && agg.item_voter_counts[item.id]) {
              proofMatchMap[pid] = item.strength_label
            }
          })
        }
      }
    } else if (query) {
      // voice マッチ（前後20字の抜粋 + マッチ数集計）
      for (const v of proofVotes || []) {
        if (v.comment && v.comment.includes(query)) {
          commentMatchProIds.add(v.professional_id)
          voiceMatchCountMap[v.professional_id] = (voiceMatchCountMap[v.professional_id] || 0) + 1
          if (!voiceMatchMap[v.professional_id]) {
            const excerpt = buildVoiceExcerpt(v.comment)
            if (excerpt) voiceMatchMap[v.professional_id] = excerpt
          }
        }
      }
      // proof マッチ（proof_items の strength_label に query が含まれるか）
      for (const item of proofItems || []) {
        if (item.strength_label && item.strength_label.includes(query)) {
          // この proof_item を selected_proof_ids に持つプロを特定
          // §2-8: continuation行は selected_proof_ids を保持したまま保存されるため除外する
          for (const v of proofVotes || []) {
            if (v.vote_type !== 'continuation' && v.selected_proof_ids?.includes(item.id)) {
              if (!proofMatchMap[v.professional_id]) {
                proofMatchMap[v.professional_id] = item.strength_label
              }
            }
          }
        }
      }
    }

    // VoterInfo型（session_countフォールバック対応）
    interface VoterInfo {
      totalCount: number
      firstSessionCount: string | null
      firstVoteId: string
    }
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

    // プロごとの集計
    // X-Day対応(2026-08-08): proofItemCounts は Set ではなく人数(数値)を持つ形に変更
    // (RPC集計パスと共通の形にするため。JS集計パスでは下のループで Set を作ってから size を書き込む)。
    // voterAgg は RPC パスで DB 側集計済みの値が入る(JS パスでは null のまま voterInfoMap から計算)。
    // ⚠️ totalVotes / voterInfoMap は RPC パスでは常に 0/空のまま(JS集計パス専用)。
    //    ここを読む新コードを足すときは voterAgg 側と両対応にすること。
    const proStats = new Map<string, {
      totalVotes: number
      totalProofs: number
      recentProofs: number
      rising7d: number
      lastProofAt: Date | null
      categoryCount: Record<string, number>
      recentCategoryCount: Record<string, number>
      voterInfoMap: Record<string, VoterInfo>
      latestVoteComment: string
      // §2-8: 票数ではなく人数（DISTINCT normalized_email）でカウントする。
      // email が無い投票は id をフォールバックキーにして個別カウントする（重複判定不能なため）。
      proofItemCounts: Record<string, number>
      voterAgg: { uniqueVoters: number; firstCount: number; repeaterCount: number; regularCount: number } | null
    }>()

    const ensureStat = (pid: string) => {
      if (!proStats.has(pid)) {
        proStats.set(pid, {
          totalVotes: 0,
          totalProofs: 0,
          recentProofs: 0,
          rising7d: 0,
          lastProofAt: null,
          categoryCount: {},
          recentCategoryCount: {},
          voterInfoMap: {},
          latestVoteComment: '',
          proofItemCounts: {},
          voterAgg: null,
        })
      }
      return proStats.get(pid)!
    }

    // 1) リピーター率・CLIENT COMPOSITION用: 全投票からvoterInfoMap集計（session_countフォールバック対応）
    for (const v of allVotesForRepeater || []) {
      const stat = ensureStat(v.professional_id)
      stat.totalVotes++

      const email = v.normalized_email || ''
      if (!email) continue
      if (!stat.voterInfoMap[email]) {
        stat.voterInfoMap[email] = {
          totalCount: 1,
          firstSessionCount: v.session_count || null,
          firstVoteId: v.id,
        }
      } else {
        stat.voterInfoMap[email].totalCount += 1
      }
    }

    // 2) プルーフ投票からスコア・カテゴリ集計（JS集計パスのみ。RPCパスでは proofVotes は空配列）
    const proofItemVoterSets = new Map<string, Record<string, Set<string>>>()
    for (const vote of proofVotes || []) {
      const stat = ensureStat(vote.professional_id)
      stat.totalProofs++

      if (vote.comment) {
        stat.latestVoteComment = vote.comment
      }

      const _d = new Date(vote.created_at)
      if (!stat.lastProofAt || _d > stat.lastProofAt) stat.lastProofAt = _d

      const isRecent = _d >= thirtyDaysAgo
      if (isRecent) {
        stat.recentProofs++
      }
      // 「今週の急上昇」用(proof+continuation・下のPick upソートで使用)
      if (_d >= sevenDaysAgo) {
        stat.rising7d++
      }

      // §2-8: continuation行は selected_proof_ids を保持したまま保存されるが、
      // 強み項目別集計（カテゴリ・proofItemCounts）には不算入とする。
      // totalProofs/recentProofs/lastProofAt/comment は上で既に算入済み（件数系はcontinuationも含む）。
      if (vote.vote_type !== 'continuation') {
        // §2-8: proofItemCounts は票数ではなく人数（DISTINCT normalized_email）でカウント
        const voterKey = vote.normalized_email || vote.id
        if (!proofItemVoterSets.has(vote.professional_id)) proofItemVoterSets.set(vote.professional_id, {})
        const voterSets = proofItemVoterSets.get(vote.professional_id)!
        for (const itemId of vote.selected_proof_ids || []) {
          const tab = itemTabMap[itemId]
          if (tab) {
            stat.categoryCount[tab] = (stat.categoryCount[tab] || 0) + 1
            if (isRecent) {
              stat.recentCategoryCount[tab] = (stat.recentCategoryCount[tab] || 0) + 1
            }
          }
          if (!voterSets[itemId]) voterSets[itemId] = new Set<string>()
          voterSets[itemId].add(voterKey)
        }
      }
    }
    // JS集計パス: Set の人数を数値へ確定(下流は数値のみを見る)
    proofItemVoterSets.forEach((voterSets, pid) => {
      const stat = ensureStat(pid)
      for (const itemId of Object.keys(voterSets)) {
        stat.proofItemCounts[itemId] = voterSets[itemId].size
      }
    })

    // X-Day対応: RPC集計パスでは proStats を RPC の集計行から直接構築する
    // (定義は上のJSループと同一。categoryCount/recentCategoryCount は item別票数×itemTabMapで復元)。
    if (useRpc && rpcAggregates) {
      rpcAggregates.forEach((agg, pid) => {
        const stat = ensureStat(pid)
        stat.totalProofs = agg.total_proofs
        stat.recentProofs = agg.recent_proofs_30d
        stat.rising7d = agg.rising_7d
        stat.lastProofAt = agg.last_proof_at ? new Date(agg.last_proof_at) : null
        stat.latestVoteComment = agg.latest_comment || ''
        stat.proofItemCounts = agg.item_voter_counts || {}
        const itemVoteCounts: Record<string, number> = agg.item_vote_counts || {}
        for (const itemId of Object.keys(itemVoteCounts)) {
          const tab = itemTabMap[itemId]
          if (tab) stat.categoryCount[tab] = (stat.categoryCount[tab] || 0) + itemVoteCounts[itemId]
        }
        const itemVoteCounts30d: Record<string, number> = agg.item_vote_counts_30d || {}
        for (const itemId of Object.keys(itemVoteCounts30d)) {
          const tab = itemTabMap[itemId]
          if (tab) stat.recentCategoryCount[tab] = (stat.recentCategoryCount[tab] || 0) + itemVoteCounts30d[itemId]
        }
        stat.voterAgg = {
          uniqueVoters: agg.unique_voters,
          firstCount: agg.first_count,
          repeaterCount: agg.repeater_count,
          regularCount: agg.regular_count,
        }
      })
    }

    // §2-2改訂: 🟡点灯条件の厳格化のため、delegate_list_id群の「有効性」(承諾済み+受付中の
    // メンバーが1名以上いるか)を一括判定する。referralSignalはプロ閲覧時のみ使うため、
    // 非プロ閲覧時はこのクエリ自体を実行しない(fail closed・無駄クエリ回避)。
    const validDelegateListIds = viewerIsProStrict
      ? await getValidDelegateListIds(supabase, professionals.map(p => p.delegate_list_id))
      : new Set<string>()

    // プロデータの組み立て
    let result = professionals.map(pro => {
      const stat = proStats.get(pro.id) || {
        totalVotes: 0,
        totalProofs: 0,
        recentProofs: 0,
        rising7d: 0,
        lastProofAt: null,
        categoryCount: {},
        recentCategoryCount: {},
        voterInfoMap: {},
        latestVoteComment: '',
        proofItemCounts: {},
        voterAgg: null,
      }

      // プルーフ0は除外
      if (stat.totalProofs === 0) return null

      // リピーター率・CLIENT COMPOSITION: session_countフォールバック対応
      // X-Day対応: RPC集計パスでは DB 側で同じ level 規則で集計済み(stat.voterAgg)。
      let uniqueVoters = 0
      let firstCount = 0
      let repeaterCount = 0
      let regularCount = 0
      if (stat.voterAgg) {
        uniqueVoters = stat.voterAgg.uniqueVoters
        firstCount = stat.voterAgg.firstCount
        repeaterCount = stat.voterAgg.repeaterCount
        regularCount = stat.voterAgg.regularCount
      } else {
        uniqueVoters = Object.keys(stat.voterInfoMap).length
        for (const info of Object.values(stat.voterInfoMap)) {
          const level = getVoterLevel(info)
          if (level >= 3) regularCount++
          else if (level === 2) repeaterCount++
          else firstCount++
        }
      }
      const repeaterRate = uniqueVoters >= 3
        ? Math.round(wilsonScore(regularCount, uniqueVoters) * 100)
        : null

      // 新規に強いスコア
      // 初回率が高く、かつ母数がある程度ある人が上位に来る
      const newClientScore = uniqueVoters >= 5
        ? Math.round((firstCount / uniqueVoters) * Math.log(uniqueVoters + 1) * 100) / 100
        : null

      // Voiceスニペット（40字カット）
      const rawVoice = pro.featured_vote_id
        ? featuredVoteMap[pro.featured_vote_id] || stat.latestVoteComment
        : stat.latestVoteComment
      const voiceSnippet = rawVoice
        ? rawVoice.length > 40 ? rawVoice.slice(0, 40) + '...' : rawVoice
        : null

      // カテゴリスコア計算
      const targetTabs = CATEGORY_TAB_MAP[category] || []
      const skillCount = stat.categoryCount['skill'] || 0
      const universalCount = stat.categoryCount['universal'] || 0

      let categoryScore = 0
      for (const tab of targetTabs) {
        categoryScore += stat.categoryCount[tab] || 0
      }
      // universal項目を0.2倍で全カテゴリに加算
      categoryScore += universalCount * 0.2
      // 指導力(skill)を0.2倍で他カテゴリに加算（skillカテゴリ自身には二重加算しない）
      if (category !== 'skill') {
        categoryScore += skillCount * 0.2
      }
      // specialistはさらに0.2倍を追加
      if (subCategory === 'specialist') {
        categoryScore += skillCount * 0.2
      }

      // 対応カテゴリ数（5件以上のプルーフがあるカテゴリ、skill/universal除く）
      const diverseCategoryCount = Object.entries(stat.categoryCount)
        .filter(([tab, count]) => tab !== 'skill' && tab !== 'universal' && count >= 5)
        .length

      // Featured proof: featured_proof_id があればそれ、なければ最得票のproof_item
      let featuredProof: { strengthLabel: string; label: string; votes: number } | null = null
      const fpId = pro.featured_proof_id
      if (fpId && (stat.proofItemCounts[fpId] || 0) > 0) {
        const item = (proofItems || []).find(i => i.id === fpId)
        if (item) {
          featuredProof = {
            strengthLabel: item.strength_label || '',
            label: item.tab || '',
            votes: stat.proofItemCounts[fpId],
          }
        }
      }
      if (!featuredProof) {
        // 最多人数のproof_item（1人以上）
        let bestId = ''
        let bestCount = 0
        for (const [itemId, count] of Object.entries(stat.proofItemCounts)) {
          if (count > bestCount) {
            bestCount = count
            bestId = itemId
          }
        }
        if (bestId && bestCount >= 1) {
          const item = (proofItems || []).find(i => i.id === bestId)
          if (item) {
            featuredProof = {
              strengthLabel: item.strength_label || '',
              label: item.tab || '',
              votes: bestCount,
            }
          }
        }
      }

      // categoryTopProof: カテゴリ別の最得票proof_item（universal含む）
      let categoryTopProof: { strengthLabel: string; votes: number } | null = null
      if (category !== 'multi' && category !== 'none' && targetTabs.length > 0) {
        const topProofTabs = [...targetTabs]
        const categoryItemIds = new Set(
          (proofItems || [])
            .filter(i => topProofTabs.includes(i.tab))
            .map(i => i.id)
        )
        let bestId = ''
        let bestCount = 0
        for (const [itemId, count] of Object.entries(stat.proofItemCounts)) {
          if (categoryItemIds.has(itemId) && count > bestCount) {
            bestCount = count
            bestId = itemId
          }
        }
        if (bestId && bestCount >= 1) {
          const item = (proofItems || []).find(i => i.id === bestId)
          if (item) {
            categoryTopProof = {
              strengthLabel: item.strength_label || '',
              votes: bestCount,
            }
          }
        }
      }

      // topPersonality（旧UI: is_active 関係なくTOP1）
      let topPersonality: { label: string } | null = null
      // topPersonalitiesByCategory（新UI: カテゴリ別TOP1, is_active=trueのみ）
      const topPersonalitiesByCategory: {
        inner: { label: string; personality_label: string; votes: number } | null
        interpersonal: { label: string; personality_label: string; votes: number } | null
        atmosphere: { label: string; personality_label: string; votes: number } | null
      } = { inner: null, interpersonal: null, atmosphere: null }
      const perCounts = proPersonalityCounts.get(pro.id)
      if (perCounts) {
        let topId = ''
        let topCount = 0
        for (const [perId, count] of Object.entries(perCounts)) {
          if (count > topCount) { topCount = count; topId = perId }
        }
        if (topId && personalityLabelMap[topId]) {
          topPersonality = { label: personalityLabelMap[topId] }
        }

        // カテゴリ別の集計（is_active=true のみ）
        const byCategory: Record<string, { id: string; count: number }[]> = {
          inner: [], interpersonal: [], atmosphere: [],
        }
        for (const [perId, count] of Object.entries(perCounts)) {
          if (!activePersonalityIds.has(perId)) continue
          const cat = personalityCategoryMap[perId]
          if (cat && byCategory[cat]) {
            byCategory[cat].push({ id: perId, count })
          }
        }
        for (const catKey of ['inner', 'interpersonal', 'atmosphere'] as const) {
          const list = byCategory[catKey]
          if (list.length === 0) continue
          list.sort((a, b) => b.count - a.count)
          const top = list[0]
          topPersonalitiesByCategory[catKey] = {
            label: personalityLabelMap[top.id] || '',
            personality_label: personalityPersonalityLabelMap[top.id] || '',
            votes: top.count,
          }
        }
      }

      return {
        id: pro.id,
        name: pro.name,
        title: pro.title,
        prefecture: pro.prefecture,
        area_description: pro.area_description,
        bio: pro.bio,
        photo_url: pro.photo_url,
        totalProofs: stat.totalProofs,
        recentProofs: stat.recentProofs,
        lastProofAt: stat.lastProofAt,
        categoryScore,
        diverseCategoryCount,
        categoryCount: stat.categoryCount,
        badges: {
          rising: pro.badge_rising,
          specialist: pro.badge_specialist,
          multi: pro.badge_multi,
          top: pro.badge_top,
        },
        repeaterRate,
        regularCount,
        firstCount,
        repeaterCount,
        newClientScore,
        voiceSnippet,
        recentCategoryCount: stat.recentCategoryCount,
        matchedVoice: voiceMatchMap[pro.id] || null,
        matchedProofLabel: proofMatchMap[pro.id] || null,
        matchSource: voiceMatchMap[pro.id] ? 'voice' as const : proofMatchMap[pro.id] ? 'proof' as const : null,
        voiceMatchCount: voiceMatchCountMap[pro.id] || 0,
        profileMatchField: (() => {
          if (!query) return null
          const q = query.toLowerCase()
          if (pro.name?.toLowerCase().includes(q)) return 'name' as const
          if (pro.title?.toLowerCase().includes(q)) return 'title' as const
          if (pro.area_description?.toLowerCase().includes(q)) return 'area' as const
          if (pro.prefecture?.toLowerCase().includes(q)) return 'prefecture' as const
          if (pro.bio?.toLowerCase().includes(q)) return 'bio' as const
          return null
        })(),
        featuredProof,
        categoryTopProof,
        topPersonality,
        topPersonalitiesByCategory,
        // §2-2改訂: 3色インジケータ(プロ向け検索・ReferralTab共通)。非プロ閲覧時は付与しない
        referralSignal: viewerIsProStrict
          ? computeReferralSignal(
              pro.accepting_status,
              !!pro.delegate_list_id && validDelegateListIds.has(pro.delegate_list_id)
            )
          : null,
        // CEO指摘対応(2026-08-06・§3検索カードの受付状態表示): クライアント向け検索カードは
        // 色記号(🟢🟡🔴)を出さず、停止中のときだけ1行テキストで知らせる方針。referralSignalは
        // プロ向け専用(非プロにはnull)のため別途boolean1個だけ常に付与する(色/内部用語は漏らさない)。
        // isReferralFullyLaunched()でゲート(現在'all'以外の間は常にfalse)。
        // Pick up（category='multi'）で「今週の急上昇」に該当した人かどうか。
        // 見出し「今週の急上昇」が、後ろに繋げたフォールバック（おすすめ）にまで
        // かかって見えるのを防ぐためにフロントへ渡す。multi以外では常にfalse。
        isRising: false,
        referralClosedNotice: isReferralFullyLaunched()
          ? !isReferralReachable(
              computeReferralSignal(
                pro.accepting_status,
                !!pro.delegate_list_id && validDelegateListIds.has(pro.delegate_list_id)
              )
            )
          : false,
      }
    }).filter((p): p is NonNullable<typeof p> => p !== null)

    // テキスト検索フィルタ
    if (query) {
      const q = query.toLowerCase()
      result = result.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.title?.toLowerCase().includes(q) ||
        p.area_description?.toLowerCase().includes(q) ||
        p.prefecture?.toLowerCase().includes(q) ||
        p.bio?.toLowerCase().includes(q) ||
        commentMatchProIds.has(p.id) ||
        !!proofMatchMap[p.id]
      )
    }

    // カテゴリフィルタ（カテゴリ選択時: 該当カテゴリにプルーフがあるプロのみ）
    if (category !== 'none' && category !== 'multi') {
      result = result.filter(p => {
        const targetTabs = CATEGORY_TAB_MAP[category] || []
        return targetTabs.some(tab => (p.categoryCount[tab] || 0) > 0)
      })
    }

    // クエリがある場合: voiceMatchCount順でソート（マッチ多い順 → categoryScore順）
    if (query) {
      result.sort((a, b) => {
        if (b.voiceMatchCount !== a.voiceMatchCount) return b.voiceMatchCount - a.voiceMatchCount
        return b.categoryScore - a.categoryScore
      })
    }

    // ソート（クエリなしの場合のみ適用）
    else if (category === 'multi') {
      // CEO指示(2026-08-06): Pick up既定表示は「今週の急上昇」= 直近7日間の確定済み
      // プルーフ記録の件数が多い順。下限3件未達はランキングに載せない。
      // proofVotesは既に取得済み(status='confirmed'・対象proIds絞り)のため、
      // 追加クエリなしでJS集計する(votes全件スキャンの追加禁止・既存取得分を流用)。
      //
      // 修正(2026-08-06・CEO報告「Pickupの表示が正しくない」):
      //   ここだけ vote_type==='proof' に絞っており、**リピーターの記録(continuation)が
      //   丸ごと落ちていた**。同じ週に同じ人数の記録が集まっても、常連さん中心のプロは
      //   急上昇に載らないという歪みが出る。
      //   「施術を受けた記録」= proof + continuation は同日にadminの日別集計でも直した定義で、
      //   このファイル内の totalProofs / recentProofs / lastProofAt も既にその定義。
      //   ここだけ違っていたので揃える（CLAUDE.md「vote_typeは4種」参照）。
      // X-Day対応(2026-08-08): votes の再スキャンをやめ、集計済みの stat.rising7d を使う
      // (JS集計パスでは上のループ内で・RPCパスでは DB 側で、同じ proof+continuation 定義で集計済み)。
      const rising7dCounts = new Map<string, number>()
      proStats.forEach((stat, pid) => {
        if (stat.rising7d > 0) rising7dCounts.set(pid, stat.rising7d)
      })

      const risingList = result
        .filter(p => (rising7dCounts.get(p.id) || 0) >= RISING_MIN_VOTES_7D)
        .sort((a, b) => (rising7dCounts.get(b.id) || 0) - (rising7dCounts.get(a.id) || 0))
      const risingIdSet = new Set(risingList.map(p => p.id))
      // 見出し「今週の急上昇」がフォールバック分にまでかかって見えないよう、
      // 該当者だけに印を付けてフロントに渡す（該当0名なら見出し自体を出さない）。
      for (const p of risingList) p.isRising = true

      // フォールバック: 下限を満たすプロが少ない場合にランキングが空/薄くならないよう、
      // 既存の「おすすめ」ロジック(質フロア: 5proof以上・直近90日活動・シャッフル)を
      // 急上昇と重複しない分だけ後ろに繋げる。
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      const fallback = shuffle(
        result.filter(p =>
          !risingIdSet.has(p.id) &&
          p.totalProofs >= 5 &&
          p.lastProofAt && new Date(p.lastProofAt) >= ninetyDaysAgo
        )
      )

      result = [...risingList, ...fallback]
    }
    else if (category === 'none') {
      // 従来の複合スコア降順を維持（現状のロジックをそのまま残す）
      const getMultiScore = (p: typeof result[number]) =>
        p.diverseCategoryCount * 2.0
        + p.totalProofs * 0.5
        + p.recentProofs * 1.0
        + (p.repeaterRate || 0) * 0.3
      result.sort((a, b) => getMultiScore(b) - getMultiScore(a))
    } else {
      // サブカテゴリ別ソート（カテゴリ選択時）
      switch (subCategory) {
        case 'rising': {
          // 今月急上昇: 選択カテゴリの直近30日プルーフ数順
          const risingTabs = CATEGORY_TAB_MAP[category] || []
          const getRecentScore = (p: typeof result[number]) => {
            let score = 0
            for (const tab of risingTabs) {
              score += p.recentCategoryCount[tab] || 0
            }
            return score
          }
          result.sort((a, b) => getRecentScore(b) - getRecentScore(a))
          result = result.filter(p => getRecentScore(p) > 0)
          break
        }

        case 'specialist':
          // この分野のプロ: カテゴリスコア順（指導力0.5倍加算済み）
          result.sort((a, b) => b.categoryScore - a.categoryScore)
          break

        case 'repeater': {
          // リピーターが多い: カテゴリ適合度 + リピーター率
          result = result.filter(p => p.repeaterRate !== null)
          const getRepeaterScore = (p: typeof result[number]) =>
            p.categoryScore * 0.3 + (p.repeaterRate || 0) * 0.7
          result.sort((a, b) => getRepeaterScore(b) - getRepeaterScore(a))
          break
        }

        case 'new_client': {
          // 🌊 新規に強い: newClientScoreが高い順
          result = result.filter(p => p.newClientScore !== null)
          result.sort((a, b) => {
            const scoreA = a.newClientScore || 0
            const scoreB = b.newClientScore || 0
            if (scoreB !== scoreA) return scoreB - scoreA
            return b.categoryScore - a.categoryScore
          })
          break
        }

        case 'top': {
          // 総合力: カテゴリ適合度 + 最近の活動 + リピーター率
          const getTopScore = (p: typeof result[number]) =>
            p.categoryScore * 0.5
            + p.recentProofs * 1.5
            + (p.repeaterRate || 0) * 0.5
          result.sort((a, b) => getTopScore(b) - getTopScore(a))
          break
        }

        default:
          result.sort((a, b) => b.recentProofs - a.recentProofs)
      }
    }

    // レビュー指摘: referral_onlyは呼び出し元ゼロのデッドパラメータだったため削除。
    // 「紹介につながる人のみ表示」フィルタはクライアント側(SearchPageClient)の最終段の絞りに一本化。
    // referralSignalの付与自体はここに残す(クライアント側フィルタ・3色ドット表示に必要)。

    return NextResponse.json({
      professionals: result,
      total: result.length,
    }, {
      headers: { 'Cache-Control': 'no-store' }
    })

  } catch (error) {
    console.error('Search API error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
