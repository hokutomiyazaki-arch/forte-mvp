'use client'
import { PersonalityCategory, PersonalityRank, getCategoryMeta } from '@/lib/personality'

interface PersonalityDonutProps {
  category: PersonalityCategory
  topItem: { label: string; personality_label: string; votes: number } | null
  totalVotes: number
  rank: PersonalityRank
  isSelected: boolean
  onTap: () => void
}

const SIZE = 80
const STROKE = 9
const RADIUS = (SIZE - STROKE) / 2
const CENTER = SIZE / 2
const CIRC = 2 * Math.PI * RADIUS

function arcPath(percent: number): string {
  // SVG arc from top, clockwise. percent in [0,1]
  if (percent >= 1) {
    // full circle as two arcs
    return `M ${CENTER} ${CENTER - RADIUS}
      A ${RADIUS} ${RADIUS} 0 1 1 ${CENTER - 0.001} ${CENTER - RADIUS}
      A ${RADIUS} ${RADIUS} 0 1 1 ${CENTER} ${CENTER - RADIUS}`
  }
  if (percent <= 0) return ''
  const angle = percent * 2 * Math.PI
  const x = CENTER + RADIUS * Math.sin(angle)
  const y = CENTER - RADIUS * Math.cos(angle)
  const largeArc = percent > 0.5 ? 1 : 0
  return `M ${CENTER} ${CENTER - RADIUS} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x} ${y}`
}

function rankPercent(level: number): number {
  if (level >= 4) return 1
  if (level === 3) return 0.75
  if (level === 2) return 0.5
  if (level === 1) return 0.25
  return 0
}

export default function PersonalityDonut({
  category,
  topItem,
  totalVotes,
  rank,
  isSelected,
  onTap,
}: PersonalityDonutProps) {
  const meta = getCategoryMeta(category)
  const percent = rankPercent(rank.level)

  // Lv.0: 8 dots around circle
  const dots = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI) / 4 - Math.PI / 2
    return {
      x: CENTER + RADIUS * Math.cos(angle),
      y: CENTER + RADIUS * Math.sin(angle),
    }
  })

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
      }}
    >
      <div
        style={{
          position: 'relative',
          width: SIZE,
          height: SIZE,
          borderRadius: '50%',
          padding: 4,
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          transform: isSelected ? 'scale(1.05)' : 'scale(1)',
          boxShadow: isSelected ? `0 0 0 2px ${meta.color}` : 'none',
        }}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* 背景の円（淡色） */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={meta.colorLight}
            strokeWidth={STROKE}
          />
          {rank.level === 0 ? (
            // Lv.0: 8 dots
            dots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={2.4} fill={meta.color} opacity={0.55} />
            ))
          ) : (
            <path
              d={arcPath(percent)}
              fill="none"
              stroke={meta.color}
              strokeWidth={STROKE}
              strokeLinecap="round"
            />
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
