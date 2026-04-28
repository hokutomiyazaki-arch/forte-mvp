'use client'
import {
  PersonalityCategory,
  PersonalityRank,
  getCategoryMeta,
  getCategoryPalette,
} from '@/lib/personality'

interface DonutItem {
  id: string
  label: string
  personality_label: string
  votes: number
}

interface PersonalityDonutProps {
  category: PersonalityCategory
  items: DonutItem[]
  totalVotes: number
  rank: PersonalityRank
  topItem: DonutItem | null
  isSelected: boolean
  onTap: () => void
}

const SIZE = 80
const STROKE = 9
const RADIUS = (SIZE - STROKE) / 2
const CENTER = SIZE / 2

function polarToCartesian(angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: CENTER + RADIUS * Math.cos(a),
    y: CENTER + RADIUS * Math.sin(a),
  }
}

function arcPath(startDeg: number, endDeg: number): string {
  // 12時方向起点・時計回り。endDeg > startDeg
  const sweep = endDeg - startDeg
  if (sweep <= 0) return ''
  // 完全な円は2つの半円で描画
  if (sweep >= 359.999) {
    const half1 = arcPath(0, 180)
    const half2 = arcPath(180, 359.99)
    return `${half1} ${half2}`
  }
  const start = polarToCartesian(startDeg)
  const end = polarToCartesian(endDeg)
  const largeArc = sweep > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

export default function PersonalityDonut({
  category,
  items,
  totalVotes,
  rank,
  topItem,
  isSelected,
  onTap,
}: PersonalityDonutProps) {
  const meta = getCategoryMeta(category)
  const palette = getCategoryPalette(category)

  const dots = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI) / 4 - Math.PI / 2
    return {
      x: CENTER + RADIUS * Math.cos(angle),
      y: CENTER + RADIUS * Math.sin(angle),
    }
  })

  // 票数 1 以上の項目のみソート（既に降順想定だが念のため）
  const visible = items.filter(i => i.votes > 0).sort((a, b) => b.votes - a.votes)

  // セグメント計算
  const segments: { startDeg: number; endDeg: number; color: string; id: string }[] = []
  if (totalVotes > 0) {
    let cursor = 0
    visible.forEach((item, idx) => {
      const sweep = (item.votes / totalVotes) * 360
      const colorIdx = Math.min(idx, 4)
      segments.push({
        startDeg: cursor,
        endDeg: cursor + sweep,
        color: palette[colorIdx],
        id: item.id,
      })
      cursor += sweep
    })
  }

  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        transition: 'transform 0.2s ease, filter 0.2s ease',
        transform: isSelected ? 'scale(1.04)' : 'scale(1)',
        filter: isSelected ? 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.08))' : 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: SIZE,
          height: SIZE,
        }}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {rank.level === 0 ? (
            <>
              {/* 背景の薄いリング（任意。視認性を保つ） */}
              <circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={palette[4]}
                strokeWidth={STROKE * 0.4}
              />
              {dots.map((d, i) => (
                <circle key={i} cx={d.x} cy={d.y} r={2.6} fill={palette[1]} />
              ))}
            </>
          ) : (
            <>
              {/* 未投票分の背景円（最淡色） */}
              <circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={palette[4]}
                strokeWidth={STROKE}
              />
              {/* 各セグメント */}
              {segments.map(seg => (
                <path
                  key={seg.id}
                  d={arcPath(seg.startDeg, seg.endDeg)}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={STROKE}
                  strokeLinecap="butt"
                />
              ))}
            </>
          )}
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            lineHeight: 1,
            pointerEvents: 'none',
          }}
        >
          {rank.icon}
        </div>
      </div>
      <div style={{ textAlign: 'center', lineHeight: 1.4 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: meta.color }}>
          {meta.emoji} {meta.name}
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#1A1A2E',
            marginTop: 2,
            minHeight: 16,
          }}
        >
          {rank.level === 0 ? '投票募集中' : topItem?.personality_label || '—'}
        </div>
        {rank.level > 0 && totalVotes > 0 && (
          <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
            {totalVotes}票
          </div>
        )}
      </div>
    </button>
  )
}
