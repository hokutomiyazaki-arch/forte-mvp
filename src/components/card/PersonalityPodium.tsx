'use client'
/**
 * パーソナリティ「お客さんが見た印象」トップ3 横並び表彰台。
 * 公開カード (CardClient) とダッシュボード (dashboard/page.tsx) で共用。
 *   - 中央=1位(大) / 左=2位・右=3位(小)
 *   - キャラ画像(透過PNG) + タイプ名 + 票数(%)、description は1位のみ
 *   - レベル装飾はそのタイプの votes で判定（全部CSS・DB追加なし）
 */
import { COLORS, FONTS } from '@/lib/design-tokens'

const T = { ...COLORS, fontMono: FONTS.mono }

export interface PersonalityPodiumItem {
  id: string
  label: string
  description: string | null
  votes: number
  image_url: string | null
}

// レベル装飾の票数閾値（後で調整可）
export const PERSONALITY_TIER = { bronze: 5, silver: 15, gold: 30 }

// 票数 → レベル枠スタイル
export function getPersonalityTierStyle(votes: number): {
  ring: string
  glow: string
  badge: string | null
} {
  if (votes >= PERSONALITY_TIER.gold) {
    return { ring: '#C4A35A', glow: '0 0 12px 2px #C4A35A66', badge: '💎' }
  }
  if (votes >= PERSONALITY_TIER.silver) {
    return { ring: '#C0C0C0', glow: 'none', badge: '⭐' }
  }
  if (votes >= PERSONALITY_TIER.bronze) {
    return { ring: '#CD7F32', glow: 'none', badge: null }
  }
  return { ring: 'transparent', glow: 'none', badge: null }
}

interface Props {
  items: PersonalityPodiumItem[]
  proName: string
}

export function PersonalityPodium({ items, proName }: Props) {
  const total = items.reduce((s, i) => s + i.votes, 0)
  const top3 = [...items]
    .filter(i => i.votes > 0)
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 3)

  // 0票時
  if (top3.length === 0) {
    return (
      <div style={{ textAlign: 'center', fontSize: 12, color: T.textSub }}>
        これから物語が刻まれる
      </div>
    )
  }

  // 横並び表彰台: 中央=1位(大)、左=2位・右=3位(小)
  const order =
    top3.length === 1
      ? [{ item: top3[0], rank: 0 }]
      : top3.length === 2
      ? [
          { item: top3[1], rank: 1 },
          { item: top3[0], rank: 0 },
        ]
      : [
          { item: top3[1], rank: 1 },
          { item: top3[0], rank: 0 },
          { item: top3[2], rank: 2 },
        ]

  const renderChar = ({ item, rank }: { item: PersonalityPodiumItem; rank: number }) => {
    const pct = total > 0 ? Math.round((item.votes / total) * 100) : 0
    const tier = getPersonalityTierStyle(item.votes)
    const isFirst = rank === 0
    const imgSize = isFirst ? 130 : 100
    const medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : '🥉'
    return (
      <div key={item.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6 }}>
        {item.image_url && (
          <div style={{
            width: imgSize, height: imgSize, borderRadius: '50%',
            border: tier.ring === 'transparent' ? '2px solid transparent' : `3px solid ${tier.ring}`,
            boxShadow: tier.glow,
            background: '#FAF8F3', overflow: 'hidden', position: 'relative',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image_url} alt={item.label} style={{ width: '92%', height: '92%', objectFit: 'contain' }} />
            {tier.badge && (
              <span style={{ position: 'absolute', top: -2, right: -2, fontSize: isFirst ? 18 : 15 }}>{tier.badge}</span>
            )}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span style={{ fontSize: isFirst ? 16 : 13 }}>{medal}</span>
          <span style={{ fontSize: isFirst ? 14 : 12, fontWeight: 700, color: T.text }}>{item.label}</span>
        </div>
        <span style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontMono }}>{item.votes}票 ({pct}%)</span>
      </div>
    )
  }

  return (
    <>
      <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>
        {proName}さんはこんな印象！
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, color: T.textMuted, marginBottom: 14 }}>
        お客さんが抱いた印象トップ3
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8 }}>
        {order.map(renderChar)}
      </div>
      {top3[0].description && (
        <div style={{ textAlign: 'center', fontSize: 11, color: T.textSub, lineHeight: 1.5, marginTop: 12, padding: '0 8px' }}>
          {top3[0].description}
        </div>
      )}
      <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: T.textSub }}>
        お客さん <span style={{ fontWeight: 'bold', color: T.gold }}>{total}</span> 人がこう見ています
      </div>
    </>
  )
}
