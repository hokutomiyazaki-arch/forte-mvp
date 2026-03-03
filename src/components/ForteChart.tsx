'use client'
import { VoteSummary, Professional } from '@/lib/types'
import { PROVEN_THRESHOLD, SPECIALIST_THRESHOLD, PROVEN_GOLD } from '@/lib/constants'

interface PersonalitySummary {
  category: string
  vote_count: number
}

interface Props {
  votes: VoteSummary[]
  personalityVotes?: PersonalitySummary[]
  professional?: Professional | null
  showLabels?: boolean
}

export default function ForteChart({ votes, personalityVotes = [], professional, showLabels = true }: Props) {
  const sortedResults = [...votes].sort((a, b) => b.vote_count - a.vote_count)
  const sortedPersonality = [...personalityVotes].sort((a, b) => b.vote_count - a.vote_count)
  const rawMax = Math.max(
    ...sortedResults.map(v => v.vote_count),
    ...sortedPersonality.map(v => v.vote_count),
    1
  )
  const maxVotes = Math.ceil(rawMax * 1.5)

  return (
    <div className="space-y-6">
      {/* 強みプルーフ */}
      {sortedResults.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-[#1A1A2E] mb-3 flex items-center gap-1">
            強み
          </h3>
          <div className="space-y-2">
            {sortedResults.map(v => {
              const isProven = v.vote_count >= PROVEN_THRESHOLD
              const isSpecialist = v.vote_count >= SPECIALIST_THRESHOLD
              const barColor = isProven ? PROVEN_GOLD : '#1A1A2E'
              const mark = isSpecialist ? ' 🏆' : isProven ? ' ✦' : ''
              return (
                <div key={v.category}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-[#1A1A2E]">
                      {v.category}
                    </span>
                    {showLabels && (
                      <span className="text-sm font-bold" style={{ color: isProven ? PROVEN_GOLD : '#1A1A2E' }}>
                        {v.vote_count}{mark}
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className="h-3 rounded-full transition-all duration-500"
                      style={{ width: `${(v.vote_count / maxVotes) * 100}%`, backgroundColor: barColor }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* パーソナリティプルーフ */}
      {sortedPersonality.length > 0 && (
        <div className="pt-2 border-t border-gray-100">
          <h3 className="text-sm font-bold text-[#C4A35A] mb-3 flex items-center gap-1">
            パーソナリティ
          </h3>
          <div className="space-y-2">
            {sortedPersonality.map(v => (
              <div key={v.category}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-[#C4A35A]">
                    {v.category}
                  </span>
                  {showLabels && (
                    <span className="text-sm text-[#C4A35A] font-bold">{v.vote_count}</span>
                  )}
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className="bg-[#C4A35A] h-3 rounded-full transition-all duration-500"
                    style={{ width: `${(v.vote_count / maxVotes) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sortedResults.length === 0 && sortedPersonality.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-4">まだプルーフがありません</p>
      )}
    </div>
  )
}
