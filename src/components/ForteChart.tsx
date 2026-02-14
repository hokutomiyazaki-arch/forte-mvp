'use client'
import { VoteSummary, Professional, getResultForteLabel, PERSONALITY_FORTE } from '@/lib/types'

interface Props {
  votes: VoteSummary[]
  trustCount?: number
  professional?: Professional | null
  showLabels?: boolean
}

export default function ForteChart({ votes, trustCount = 0, professional, showLabels = true }: Props) {
  const sorted = [...votes].sort((a, b) => b.vote_count - a.vote_count)
  const maxVotes = Math.max(...sorted.map(v => v.vote_count), trustCount, 1)

  return (
    <div className="space-y-3">
      {/* Result Fortes */}
      {sorted.map(v => (
        <div key={v.category}>
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-[#1A1A2E]">
              {getResultForteLabel(v.category, professional)}
            </span>
            {showLabels && (
              <span className="text-sm text-[#C4A35A] font-bold">{v.vote_count}</span>
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

      {/* Personality Forte (trust) */}
      {trustCount > 0 && (
        <div className="pt-2 border-t border-gray-100">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-[#C4A35A]">
              {PERSONALITY_FORTE.label}
            </span>
            {showLabels && (
              <span className="text-sm text-[#C4A35A] font-bold">{trustCount}</span>
            )}
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div
              className="bg-[#C4A35A] h-3 rounded-full transition-all duration-500"
              style={{ width: `${(trustCount / maxVotes) * 100}%` }}
            />
          </div>
        </div>
      )}

      {sorted.length === 0 && trustCount === 0 && (
        <p className="text-gray-400 text-sm text-center py-4">まだフォルテがありません</p>
      )}
    </div>
  )
}
