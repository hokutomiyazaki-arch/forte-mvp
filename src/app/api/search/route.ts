import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') || 'multi'
  const subCategory = searchParams.get('sub') || 'rising'
  const query = searchParams.get('q') || ''
  const prefecture = searchParams.get('prefecture') || ''

  const supabase = getSupabaseAdmin()

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    // 全アクティブプロを取得（プルーフ0除外はあとでフィルタ）
    let proQuery = supabase
      .from('professionals')
      .select(`
        id, name, title, prefecture, area_description,
        photo_url, selected_proofs,
        badge_rising, badge_specialist, badge_multi, badge_top,
        featured_vote_id, featured_proof_id, created_at
      `)
      .is('deactivated_at', null)
      .not('selected_proofs', 'is', null)

    if (prefecture) {
      proQuery = proQuery.eq('prefecture', prefecture)
    }

    const { data: professionals, error: prosError } = await proQuery

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

    // パーソナリティ投票データ（全投票タイプ）
    const { data: allVotes } = await supabase
      .from('votes')
      .select('professional_id, selected_personality_ids')
      .in('professional_id', proIds)

    // personality_items テーブル
    const { data: personalityItems } = await supabase
      .from('personality_items')
      .select('id, label')

    const personalityLabelMap: Record<string, string> = {}
    for (const item of personalityItems || []) {
      personalityLabelMap[item.id] = item.label
    }

    // プロごとのパーソナリティ集計
    const proPersonalityCounts = new Map<string, Record<string, number>>()
    for (const vote of allVotes || []) {
      if (!vote.selected_personality_ids || vote.selected_personality_ids.length === 0) continue
      const pid = vote.professional_id
      if (!proPersonalityCounts.has(pid)) proPersonalityCounts.set(pid, {})
      const counts = proPersonalityCounts.get(pid)!
      for (const perId of vote.selected_personality_ids) {
        counts[perId] = (counts[perId] || 0) + 1
      }
    }

    // 検索マッチング（voice + proof）
    const commentMatchProIds = new Set<string>()
    const voiceMatchMap: Record<string, string> = {} // proId -> matched comment snippet
    const proofMatchMap: Record<string, string> = {} // proId -> matched strength_label
    if (query) {
      // voice マッチ（前後20字の抜粋）
      for (const v of votes || []) {
        if (v.comment && v.comment.includes(query)) {
          commentMatchProIds.add(v.professional_id)
          if (!voiceMatchMap[v.professional_id]) {
            const idx = v.comment.indexOf(query)
            if (idx !== -1) {
              const start = Math.max(0, idx - 20)
              const end = Math.min(v.comment.length, idx + query.length + 20)
              const excerpt = v.comment.slice(start, end)
              const prefix = start > 0 ? '...' : ''
              const suffix = end < v.comment.length ? '...' : ''
              voiceMatchMap[v.professional_id] = prefix + excerpt + suffix
            }
          }
        }
      }
      // proof マッチ（proof_items の strength_label に query が含まれるか）
      for (const item of proofItems || []) {
        if (item.strength_label && item.strength_label.includes(query)) {
          // この proof_item を selected_proof_ids に持つプロを特定
          for (const v of votes || []) {
            if (v.selected_proof_ids?.includes(item.id)) {
              if (!proofMatchMap[v.professional_id]) {
                proofMatchMap[v.professional_id] = item.strength_label
              }
            }
          }
        }
      }
    }

    // プロごとの集計
    const proStats = new Map<string, {
      totalProofs: number
      recentProofs: number
      categoryCount: Record<string, number>
      recentCategoryCount: Record<string, number>
      voterCounts: Record<string, number>
      latestVoteComment: string
      proofItemCounts: Record<string, number>
    }>()

    for (const vote of votes || []) {
      const pid = vote.professional_id
      if (!proStats.has(pid)) {
        proStats.set(pid, {
          totalProofs: 0,
          recentProofs: 0,
          categoryCount: {},
          recentCategoryCount: {},
          voterCounts: {},
          latestVoteComment: '',
          proofItemCounts: {},
        })
      }
      const stat = proStats.get(pid)!
      stat.totalProofs++

      const isRecent = new Date(vote.created_at) >= thirtyDaysAgo
      if (isRecent) {
        stat.recentProofs++
      }

      for (const itemId of vote.selected_proof_ids || []) {
        const tab = itemTabMap[itemId]
        if (tab) {
          stat.categoryCount[tab] = (stat.categoryCount[tab] || 0) + 1
          if (isRecent) {
            stat.recentCategoryCount[tab] = (stat.recentCategoryCount[tab] || 0) + 1
          }
        }
        stat.proofItemCounts[itemId] = (stat.proofItemCounts[itemId] || 0) + 1
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
        recentCategoryCount: {},
        voterCounts: {},
        latestVoteComment: '',
        proofItemCounts: {},
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
      const skillCount = stat.categoryCount['skill'] || 0

      let categoryScore = 0
      for (const tab of targetTabs) {
        categoryScore += stat.categoryCount[tab] || 0
      }
      // 指導力(skill)を0.3倍で他カテゴリに加算（skillカテゴリ自身には二重加算しない）
      if (category !== 'skill') {
        categoryScore += skillCount * 0.3
      }
      // specialistはさらに0.5倍を追加
      if (subCategory === 'specialist') {
        categoryScore += skillCount * 0.5
      }

      // 対応カテゴリ数（5件以上のプルーフがあるカテゴリ、skill除く）
      const diverseCategoryCount = Object.entries(stat.categoryCount)
        .filter(([tab, count]) => tab !== 'skill' && count >= 5)
        .length

      // Featured proof: featured_proof_id があればそれ、なければ最得票のproof_item
      let featuredProof: { strengthLabel: string; label: string; votes: number } | null = null
      const fpId = pro.featured_proof_id
      if (fpId && stat.proofItemCounts[fpId] && stat.proofItemCounts[fpId] > 0) {
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
        // 最得票のproof_item（1票以上）
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

      // categoryTopProof: カテゴリ別の最得票proof_item
      let categoryTopProof: { strengthLabel: string; votes: number } | null = null
      if (category !== 'multi' && category !== 'none' && targetTabs.length > 0) {
        const categoryItemIds = new Set(
          (proofItems || [])
            .filter(i => targetTabs.includes(i.tab))
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

      // topPersonality
      let topPersonality: { label: string } | null = null
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
        voiceSnippet,
        recentCategoryCount: stat.recentCategoryCount,
        matchedVoice: voiceMatchMap[pro.id] || null,
        matchedProofLabel: proofMatchMap[pro.id] || null,
        matchSource: voiceMatchMap[pro.id] ? 'voice' as const : proofMatchMap[pro.id] ? 'proof' as const : null,
        featuredProof,
        categoryTopProof,
        topPersonality,
      }
    }).filter((p): p is NonNullable<typeof p> => p !== null)

    // テキスト検索フィルタ
    if (query) {
      result = result.filter(p =>
        p.name?.includes(query) ||
        p.title?.includes(query) ||
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

    // ソート
    if (category === 'none' || category === 'multi') {
      // マルチスペシャリスト: 対応カテゴリ数ベースの複合スコア
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
