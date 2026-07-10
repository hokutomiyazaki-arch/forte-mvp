'use client'
// ============================================================
// BadgeShowcase — 項目別ティア称号アイコンを「ずらっと」並べる共通コンポーネント
// ============================================================
// カードページ上部 / ダッシュボードの両方で使う。
// - 表示対象は SPECIALIST 以上（PROVEN・未達は対象外）
// - 上位ティア順（IMMORTAL → LEGEND → MASTER → SPECIALIST）に横並び
// - ラベル文字なし（アイコンのみ）。総数でサイズ可変（少なめ=大、多め=小）
// - 最大2行（最狭モバイル ~330px 想定で 2 行に収まる上限を設定）。あふれは末尾 +N
// - 称号ゼロなら null（何も描画しない）
//
// 既存の TierBadge（/medals/*.png・IMMORTAL含む）と getCertificationTier を流用。
// ============================================================

import { TierBadge, type Tier, type TierSize } from '@/components/TierBadge'
import { getCertificationTier } from '@/lib/constants'

// 表示対象ティア（上位→下位）。PROVEN は含めない。
const DISPLAY_ORDER = ['IMMORTAL', 'LEGEND', 'MASTER', 'SPECIALIST'] as const
type DisplayTier = (typeof DISPLAY_ORDER)[number]

export type TierCounts = Record<DisplayTier, number>

/**
 * 各強み項目の vote_count 配列 → 表示対象ティアごとの個数を集計。
 * PROVEN(15票)・未達は除外。IMMORTAL を漏らさないため getCertificationTier（フル）を使う。
 */
export function computeTierCounts(voteCounts: number[]): TierCounts {
  const counts: TierCounts = { IMMORTAL: 0, LEGEND: 0, MASTER: 0, SPECIALIST: 0 }
  for (const vc of voteCounts) {
    const tier = getCertificationTier(vc)
    if (tier && tier !== 'PROVEN') counts[tier] += 1
  }
  return counts
}

/** counts の合計（表示対象アイコン総数）。呼び出し側の出し分けにも使える。 */
export function totalBadges(counts: TierCounts): number {
  return counts.IMMORTAL + counts.LEGEND + counts.MASTER + counts.SPECIALIST
}

interface Props {
  counts: TierCounts
}

export function BadgeShowcase({ counts }: Props) {
  // 上位順にアイコンを平坦化
  const flat: DisplayTier[] = []
  for (const t of DISPLAY_ORDER) {
    const n = counts[t] || 0
    for (let i = 0; i < n; i++) flat.push(t)
  }
  const total = flat.length
  if (total === 0) return null // 称号ゼロは何も出さない

  // 総数でサイズ可変 + 2行に収まる上限（最狭モバイル ~330px 想定）
  //   lg(48px): ~5/行 → 2行=10 / md(32px): ~8/行 → 2行=16 / sm(24px): ~11/行 → 2行=22
  let size: TierSize
  let cap: number
  if (total <= 10) {
    size = 'lg'
    cap = 10
  } else if (total <= 16) {
    size = 'md'
    cap = 16
  } else {
    size = 'sm'
    cap = 22
  }

  const overflow = total > cap
  // あふれる場合は +N チップの分を1枠空ける
  const shown = overflow ? flat.slice(0, cap - 1) : flat
  const remaining = total - shown.length

  const px = size === 'lg' ? 48 : size === 'md' ? 32 : 24
  const gap = size === 'sm' ? 6 : 8

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap, alignItems: 'center' }}>
      {shown.map((t, i) => (
        <TierBadge key={i} tier={t as Tier} size={size} showLabel={false} />
      ))}
      {overflow && (
        <span
          style={{
            minWidth: px,
            height: px,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.round(px * 0.42),
            fontWeight: 700,
            color: '#C4A35A',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          +{remaining}
        </span>
      )}
    </div>
  )
}
