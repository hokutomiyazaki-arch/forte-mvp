'use client'

import { getForteLabel } from '@/lib/types'
import type { Professional } from '@/lib/types'

interface ForteBarProps {
  label: string
  count: number
  total: number
  maxCount: number
}

function ForteBar({ label, count, total, maxCount }: ForteBarProps) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const barWidth = maxCount > 0 ? Math.max((count / maxCount) * 100, 4) : 4

  return (
    <div className="flex items-center gap-3">
      <div className="w-20 text-right text-sm font-medium text-gray-600 shrink-0 truncate">
        {label}
      </div>
      <div className="flex-1 h-8 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-forte-gold to-amber-400 rounded-full transition-all duration-700 ease-out flex items-center justify-end pr-2"
          style={{ width: `${barWidth}%` }}
        >
          {count > 0 && (
            <span className="text-xs font-bold text-white drop-shadow-sm">
              {count}
            </span>
          )}
        </div>
      </div>
      <div className="w-10 text-right text-sm text-gray-400 shrink-0">
        {pct}%
      </div>
    </div>
  )
}

interface ForteChartProps {
  votes: { category: string; vote_count: number }[]
  pro: Professional
}

export default function ForteChart({ votes, pro }: ForteChartProps) {
  const total = votes.reduce((sum, v) => sum + v.vote_count, 0)
  const maxCount = Math.max(...votes.map(v => v.vote_count), 1)

  // Build category list from pro's selected_fortes + custom
  const categories: { key: string; label: string }[] = [
    ...(pro.selected_fortes || []).map(key => ({
      key,
      label: getForteLabel(key, pro),
    })),
    ...(pro.custom_forte_1 ? [{ key: 'custom1', label: pro.custom_forte_1 }] : []),
    ...(pro.custom_forte_2 ? [{ key: 'custom2', label: pro.custom_forte_2 }] : []),
  ]

  const sorted = categories
    .map(cat => ({
      ...cat,
      count: votes.find(v => v.category === cat.key)?.vote_count || 0,
    }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-forte-dark tracking-wide">
          あなたのフォルテ
        </h3>
        <span className="text-xs text-gray-400">{total} 票</span>
      </div>
      {sorted.map(item => (
        <ForteBar
          key={item.key}
          label={item.label}
          count={item.count}
          total={total}
          maxCount={maxCount}
        />
      ))}
    </div>
  )
}
