'use client'
import { VoteSummary, Professional, getResultForteLabel, getPersonalityForteLabel } from '@/lib/types'

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
  const maxVotes = Math.max(
    ...sortedResults.map(v => v.vote_count),
    ...sortedPersonality.map(v => v.vote_count),
    1
  )

  return (
    <div className="space-y-6">
      {/* 強みプルーフ */}
      {sortedResults.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-[#1A1A2E] mb-3 flex items-center gap-1">
            強み
          </h3>
          <div className="space-y-2">
            {sortedResults.map(v => (
              <div key={v.category}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-[#1A1A2E]">
                    {getResultForteLabel(v.category, professional)}
                  </span>
                  {showLabels && (
                    <span className="text-sm text-[#1A1A2E] font-bold">{v.vote_count}</span>
                  )}
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className="bg-[#1A1A2E] h-3 rounded-full transition-all duration-500"
                    style={{ width: `${(v.vote_count / maxVotes) * 100}%` }}
                  />
                </div>
              </div>
            ))}
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
                    {getPersonalityForteLabel(v.category, professional)}
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
