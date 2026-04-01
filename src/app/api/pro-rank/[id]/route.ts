import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const CATEGORY_TAB_MAP: Record<string, { tabs: string[]; label: string }> = {
  healing:     { tabs: ['healing'],            label: '痛みを治したい' },
  body:        { tabs: ['body', 'bodymake'],   label: '体を変えたい' },
  performance: { tabs: ['performance'],        label: '動きを高めたい' },
  mind:        { tabs: ['mind', 'discovery'],  label: '心を整えたい' },
  beauty:      { tabs: ['beauty'],             label: '美しくなりたい' },
  nutrition:   { tabs: ['nutrition'],          label: '栄養状態を改善したい' },
}

const SUB_CATEGORIES: { id: string; label: string }[] = [
  { id: 'rising',     label: '急上昇' },
  { id: 'specialist', label: 'この分野のプロ' },
  { id: 'repeater',   label: 'リピーター' },
  { id: 'top',        label: 'トップクラス' },
]

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const targetProId = params.id
  const supabase = getSupabaseAdmin()

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    // 全アクティブプロを取得
    const { data: professionals, error: prosError } = await supabase
      .from('professionals')
      .select('id, badge_top')
      .is('deactivated_at', null)
      .not('selected_proofs', 'is', null)

    if (prosError) throw prosError
    if (!professionals || professionals.length === 0) {
      return NextResponse.json({ ranks: [] }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const proIds = professionals.map(p => p.id)
    const badgeTopSet = new Set(professionals.filter(p => p.badge_top).map(p => p.id))

    // 投票データ一括取得
    const { data: votes } = await supabase
      .from('votes')
      .select('professional_id, created_at, normalized_email, selected_proof_ids')
      .in('professional_id', proIds)
      .eq('vote_type', 'proof')

    // proof_items のtab情報
    const { data: proofItems } = await supabase
      .from('proof_items')
      .select('id, tab')

    const itemTabMap: Record<string, string> = {}
    for (const item of proofItems || []) {
      itemTabMap[item.id] = item.tab
    }

    // プロごとの集計
    const proStats = new Map<string, {
      totalProofs: number
      categoryCount: Record<string, number>
      recentCategoryCount: Record<string, number>
      voterCounts: Record<string, number>
    }>()

    for (const vote of votes || []) {
      const pid = vote.professional_id
      if (!proStats.has(pid)) {
        proStats.set(pid, {
          totalProofs: 0,
          categoryCount: {},
          recentCategoryCount: {},
          voterCounts: {},
        })
      }
      const stat = proStats.get(pid)!
      stat.totalProofs++

      const isRecent = new Date(vote.created_at) >= thirtyDaysAgo

      for (const itemId of vote.selected_proof_ids || []) {
        const tab = itemTabMap[itemId]
        if (tab) {
          stat.categoryCount[tab] = (stat.categoryCount[tab] || 0) + 1
          if (isRecent) {
            stat.recentCategoryCount[tab] = (stat.recentCategoryCount[tab] || 0) + 1
          }
        }
      }

      const email = vote.normalized_email || ''
      if (email) {
        stat.voterCounts[email] = (stat.voterCounts[email] || 0) + 1
      }
    }

    // 全カテゴリ × 全サブカテゴリで順位を計算
    const ranks: { categoryLabel: string; subLabel: string; rank: number }[] = []

    for (const [catKey, catConfig] of Object.entries(CATEGORY_TAB_MAP)) {
      for (const sub of SUB_CATEGORIES) {
        // 各プロのスコアを計算
        const scored: { id: string; score: number }[] = []

        for (const pro of professionals) {
          const stat = proStats.get(pro.id)
          if (!stat || stat.totalProofs === 0) continue

          let score = 0
          switch (sub.id) {
            case 'rising': {
              for (const tab of catConfig.tabs) {
                score += stat.recentCategoryCount[tab] || 0
              }
              if (score === 0) continue
              break
            }
            case 'specialist': {
              for (const tab of catConfig.tabs) {
                score += stat.categoryCount[tab] || 0
              }
              const guidanceCount = stat.categoryCount['guidance'] || 0
              score += guidanceCount * 0.5
              break
            }
            case 'repeater': {
              if (stat.totalProofs < 10) continue
              const totalVoters = Object.keys(stat.voterCounts).length
              const repeaterAndRegular = Object.values(stat.voterCounts).filter(c => c >= 2).length
              score = totalVoters > 0 ? (repeaterAndRegular / totalVoters) * 100 : 0
              break
            }
            case 'top': {
              if (!badgeTopSet.has(pro.id)) continue
              score = stat.totalProofs
              break
            }
          }

          scored.push({ id: pro.id, score })
        }

        scored.sort((a, b) => b.score - a.score)

        // 対象プロが1〜3位に入っているか
        const idx = scored.findIndex(s => s.id === targetProId)
        if (idx >= 0 && idx < 3) {
          ranks.push({
            categoryLabel: catConfig.label,
            subLabel: sub.label,
            rank: idx + 1,
          })
        }
      }
    }

    // ランクが低い順にソート（1位が最優先）
    ranks.sort((a, b) => a.rank - b.rank)

    return NextResponse.json({ ranks }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Pro rank API error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
