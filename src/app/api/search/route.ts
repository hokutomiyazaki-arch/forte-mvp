import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// カテゴリタブ → DBのtab値のマッピング
const CATEGORY_TAB_MAP: Record<string, string[]> = {
  all: [],
  healing: ['healing'],
  body: ['body', 'bodymake'],
  performance: ['performance'],
  mind: ['mind', 'discovery'],
  beauty: ['beauty'],
  nutrition: ['nutrition'],
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') || 'all'
  const subCategory = searchParams.get('sub') || 'rising'
  const query = searchParams.get('q') || ''
  const showAll = searchParams.get('showAll') === 'true'

  const supabase = getSupabaseAdmin()

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    // 全アクティブプロを取得（プルーフ0除外はあとでフィルタ）
    const { data: professionals, error: prosError } = await supabase
      .from('professionals')
      .select(`
        id, name, title, prefecture, area_description,
        photo_url, selected_proofs,
        badge_rising, badge_specialist, badge_multi, badge_top,
        featured_vote_id, created_at
      `)
      .is('deactivated_at', null)
      .not('selected_proofs', 'is', null)

    if (prosError) throw prosError
    if (!professionals || professionals.length === 0) {
      return NextResponse.json({ professionals: [] }, {
        headers: { 'Cache-Control': 'no-store' }
      })
    }

    const proIds = professionals.map(p => p.id)

    // 投票データを一括取得
    const { data: votes } = await supabase
      .from('votes')
      .select('id, professional_id, created_at, vote_type, comment, normalized_email, selected_proof_ids')
      .in('professional_id', proIds)
      .eq('vote_type', 'proof')

    // proof_items のtab情報を取得
    const { data: proofItems } = await supabase
      .from('proof_items')
      .select('id, tab, strength_label')

    const itemTabMap: Record<string, string> = {}
    for (const item of proofItems || []) {
      itemTabMap[item.id] = item.tab
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

    // コメント検索マッチング
    const commentMatchProIds = new Set<string>()
    if (query) {
      for (const v of votes || []) {
        if (v.comment && v.comment.includes(query)) {
          commentMatchProIds.add(v.professional_id)
        }
      }
    }

    // プロごとの集計
    const proStats = new Map<string, {
      totalProofs: number
      recentProofs: number
      categoryCount: Record<string, number>
      voterCounts: Record<string, number>
      latestVoteComment: string
    }>()

    for (const vote of votes || []) {
      const pid = vote.professional_id
      if (!proStats.has(pid)) {
        proStats.set(pid, {
          totalProofs: 0,
          recentProofs: 0,
          categoryCount: {},
          voterCounts: {},
          latestVoteComment: '',
        })
      }
      const stat = proStats.get(pid)!
      stat.totalProofs++

      if (new Date(vote.created_at) >= thirtyDaysAgo) {
        stat.recentProofs++
      }

      for (const itemId of vote.selected_proof_ids || []) {
        const tab = itemTabMap[itemId]
        if (tab) {
          stat.categoryCount[tab] = (stat.categoryCount[tab] || 0) + 1
        }
      }

      const email = vote.normalized_email || ''
      if (email) {
        stat.voterCounts[email] = (stat.voterCounts[email] || 0) + 1
      }

      if (vote.comment) {
        stat.latestVoteComment = vote.comment
      }
    }

    // プロデータの組み立て
    let result = professionals.map(pro => {
      const stat = proStats.get(pro.id) || {
        totalProofs: 0,
        recentProofs: 0,
        categoryCount: {},
        voterCounts: {},
        latestVoteComment: '',
      }

      // プルーフ0は除外
      if (stat.totalProofs === 0) return null

      // リピーター率（10プルーフ以上）
      let repeaterRate: number | null = null
      let regularCount = 0
      if (stat.totalProofs >= 10) {
        const totalVoters = Object.keys(stat.voterCounts).length
        const repeaterAndRegular = Object.values(stat.voterCounts).filter(c => c >= 2).length
        regularCount = Object.values(stat.voterCounts).filter(c => c >= 5).length
        repeaterRate = totalVoters > 0
          ? Math.round((repeaterAndRegular / totalVoters) * 100)
          : 0
      }

      // Voiceスニペット（40字カット）
      const rawVoice = pro.featured_vote_id
        ? featuredVoteMap[pro.featured_vote_id] || stat.latestVoteComment
        : stat.latestVoteComment
      const voiceSnippet = rawVoice
        ? rawVoice.length > 40 ? rawVoice.slice(0, 40) + '...' : rawVoice
        : null

      // カテゴリスコア計算
      const targetTabs = CATEGORY_TAB_MAP[category] || []
      const guidanceCount = stat.categoryCount['guidance'] || 0

      let categoryScore = 0
      if (category === 'all') {
        categoryScore = stat.totalProofs
      } else {
        for (const tab of targetTabs) {
          categoryScore += stat.categoryCount[tab] || 0
        }
        // 指導力を0.5倍で加算（「この分野のプロ」スコアのみ）
        if (subCategory === 'specialist') {
          categoryScore += guidanceCount * 0.5
        }
      }

      return {
        id: pro.id,
        name: pro.name,
        title: pro.title,
        prefecture: pro.prefecture,
        area_description: pro.area_description,
        photo_url: pro.photo_url,
        totalProofs: stat.totalProofs,
        recentProofs: stat.recentProofs,
        categoryScore,
        categoryCount: stat.categoryCount,
        badges: {
          rising: pro.badge_rising,
          specialist: pro.badge_specialist,
          multi: pro.badge_multi,
          top: pro.badge_top,
        },
        repeaterRate,
        regularCount,
        voiceSnippet,
      }
    }).filter((p): p is NonNullable<typeof p> => p !== null)

    // テキスト検索フィルタ
    if (query) {
      result = result.filter(p =>
        p.name?.includes(query) ||
        p.title?.includes(query) ||
        commentMatchProIds.has(p.id)
      )
    }

    // サブカテゴリ別ソート
    switch (subCategory) {
      case 'rising':
        // 今月急上昇: 直近30日プルーフ数順
        result.sort((a, b) => b.recentProofs - a.recentProofs)
        // recentProofs = 0 は非表示
        result = result.filter(p => p.recentProofs > 0)
        break

      case 'specialist':
        // この分野のプロ: カテゴリスコア順（指導力0.5倍加算済み）
        result.sort((a, b) => b.categoryScore - a.categoryScore)
        break

      case 'repeater':
        // リピーターが多い: リピーター率順（10プルーフ以上のみ）
        result = result.filter(p => p.repeaterRate !== null)
        result.sort((a, b) => (b.repeaterRate || 0) - (a.repeaterRate || 0))
        break

      case 'top':
        // トップクラス: badge_top = true のみ
        result = result.filter(p => p.badges.top)
        result.sort((a, b) => b.totalProofs - a.totalProofs)
        break

      default:
        result.sort((a, b) => b.recentProofs - a.recentProofs)
    }

    // 「もっと見る」なし: 3件まで返す
    const total = result.length
    if (!showAll) {
      result = result.slice(0, 3)
    }

    return NextResponse.json({
      professionals: result,
      total,
      hasMore: total > 3,
    }, {
      headers: { 'Cache-Control': 'no-store' }
    })

  } catch (error) {
    console.error('Search API error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
