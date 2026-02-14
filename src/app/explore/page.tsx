'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Professional } from '@/lib/types'

interface ProWithScore extends Professional {
  total_votes: number
  votes_per_day: number
}

export default function ExplorePage() {
  const supabase = createClient()
  const [pros, setPros] = useState<ProWithScore[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: proData } = await supabase
        .from('professionals').select('*').order('created_at')

      if (!proData) { setLoading(false); return }

      const prosWithScores: ProWithScore[] = []
      for (const p of proData) {
        const { count } = await supabase
          .from('votes').select('*', { count: 'exact', head: true }).eq('professional_id', p.id)
        const totalVotes = count || 0
        const days = Math.max(1, Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000))
        prosWithScores.push({ ...p, total_votes: totalVotes, votes_per_day: totalVotes / days })
      }

      prosWithScores.sort((a, b) => b.votes_per_day - a.votes_per_day)
      setPros(prosWithScores)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="text-center py-16 text-gray-400">読み込み中...</div>

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">プロ一覧</h1>
      <p className="text-sm text-gray-500 mb-8">実力順（投票数÷登録日数）で表示</p>

      {pros.length === 0 ? (
        <p className="text-center text-gray-400 py-12">まだプロが登録されていません</p>
      ) : (
        <div className="space-y-3">
          {pros.map((p, i) => (
            <a key={p.id} href={`/card/${p.id}`}
              className="flex items-center gap-4 bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition">
              <div className="text-lg font-bold text-gray-300 w-8 text-center">{i + 1}</div>
              {p.photo_url ? (
                <img src={p.photo_url} alt="" className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-[#1A1A2E] flex items-center justify-center text-white font-bold">
                  {p.name.charAt(0)}
                </div>
              )}
              <div className="flex-1">
                <div className="font-bold text-[#1A1A2E] flex items-center gap-2">
                  {p.name}
                  {p.is_founding_member && (
                    <span className="text-xs px-2 py-0.5 bg-[#C4A35A] text-white rounded-full">FM</span>
                  )}
                  {p.badges?.map((b, j) => (
                    <span key={j} className="text-xs px-2 py-0.5 bg-[#1A1A2E] text-white rounded-full flex items-center gap-1">
                      {b.image_url && <img src={b.image_url} alt="" className="w-3 h-3" />}
                      {b.label}
                    </span>
                  ))}
                </div>
                <div className="text-sm text-gray-500">{p.title}{p.location ? ` · ${p.location}` : ''}</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-[#C4A35A]">{p.total_votes}</div>
                <div className="text-xs text-gray-400">フォルテ</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
