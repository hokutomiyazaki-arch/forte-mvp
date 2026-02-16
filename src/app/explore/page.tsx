'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Professional, RESULT_FORTES, PERSONALITY_FORTES, getResultForteLabel, getPersonalityForteLabel } from '@/lib/types'

interface ProRanking {
  professional: Professional
  vote_count: number
  total_votes: number
  days_active: number
  rate: number // vote_count / days_active
}

interface SpecialistEntry {
  professional: Professional
  forte_label: string
  forte_key: string
  vote_count: number
}

function getDaysActive(created_at: string): number {
  const created = new Date(created_at)
  const now = new Date()
  const days = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(days, 1) // 最低1日
}

export default function ExplorePage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'result' | 'personality'>('result')
  const [rankMode, setRankMode] = useState<'total' | 'active'>('total')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [rankings, setRankings] = useState<ProRanking[]>([])
  const [specialists, setSpecialists] = useState<SpecialistEntry[]>([])
  const [loading, setLoading] = useState(true)

  const resultCategories = [
    { key: 'all', label: '総合' },
    ...RESULT_FORTES.map(f => ({ key: f.key, label: f.label })),
  ]

  const personalityCategories = [
    { key: 'all', label: '総合' },
    ...PERSONALITY_FORTES.map(f => ({ key: f.key, label: f.label })),
  ]

  const currentCategories = tab === 'result' ? resultCategories : personalityCategories

  useEffect(() => {
    setSelectedCategory('all')
  }, [tab])

  useEffect(() => {
    load()
  }, [tab, selectedCategory, rankMode])

  async function load() {
    setLoading(true)

    const { data: proData } = await (supabase
      .from('professionals').select('*').order('created_at')) as any
    if (!proData) { setLoading(false); return }

    const results: ProRanking[] = []
    const specialistMap: Map<string, SpecialistEntry[]> = new Map()

    for (const p of proData) {
      const daysActive = getDaysActive(p.created_at)

      if (tab === 'result') {
        if (selectedCategory === 'all') {
          const { count } = await (supabase
            .from('votes').select('*', { count: 'exact', head: true })
            .eq('professional_id', p.id)) as any
          const vc = count || 0
          results.push({ professional: p, vote_count: vc, total_votes: vc, days_active: daysActive, rate: vc / daysActive })
        } else {
          const { data: summaryData } = await (supabase
            .from('vote_summary').select('*')
            .eq('professional_id', p.id)
            .eq('category', selectedCategory)
            .maybeSingle()) as any
          const { count: totalCount } = await (supabase
            .from('votes').select('*', { count: 'exact', head: true })
            .eq('professional_id', p.id)) as any
          const vc = summaryData?.vote_count || 0
          if (vc > 0) {
            results.push({ professional: p, vote_count: vc, total_votes: totalCount || 0, days_active: daysActive, rate: vc / daysActive })
          }
        }

        // Specialist entries (custom result fortes)
        if (p.custom_result_fortes && p.custom_result_fortes.length > 0) {
          for (const cf of p.custom_result_fortes) {
            const { data: customVoteData } = await (supabase
              .from('vote_summary').select('*')
              .eq('professional_id', p.id)
              .eq('category', cf.id)
              .maybeSingle()) as any
            if (customVoteData && customVoteData.vote_count > 0) {
              if (!specialistMap.has(cf.id)) specialistMap.set(cf.id, [])
              specialistMap.get(cf.id)!.push({
                professional: p, forte_label: cf.label, forte_key: cf.id, vote_count: customVoteData.vote_count,
              })
            }
          }
        }
      } else {
        // personality tab
        if (selectedCategory === 'all') {
          const { data: persData } = await (supabase
            .from('personality_summary').select('*')
            .eq('professional_id', p.id)) as any
          const total = persData?.reduce((sum, d) => sum + (d.vote_count || 0), 0) || 0
          results.push({ professional: p, vote_count: total, total_votes: total, days_active: daysActive, rate: total / daysActive })
        } else {
          const { data: persData } = await (supabase
            .from('personality_summary').select('*')
            .eq('professional_id', p.id)
            .eq('category', selectedCategory)
            .maybeSingle()) as any
          const { data: allPersData } = await (supabase
            .from('personality_summary').select('*')
            .eq('professional_id', p.id)) as any
          const totalPers = allPersData?.reduce((sum, d) => sum + (d.vote_count || 0), 0) || 0
          const vc = persData?.vote_count || 0
          if (vc > 0) {
            results.push({ professional: p, vote_count: vc, total_votes: totalPers, days_active: daysActive, rate: vc / daysActive })
          }
        }

        // Specialist entries (custom personality fortes)
        if (p.custom_personality_fortes && p.custom_personality_fortes.length > 0) {
          for (const cf of p.custom_personality_fortes) {
            const { data: customPersData } = await (supabase
              .from('personality_summary').select('*')
              .eq('professional_id', p.id)
              .eq('category', cf.id)
              .maybeSingle()) as any
            if (customPersData && customPersData.vote_count > 0) {
              if (!specialistMap.has(cf.id)) specialistMap.set(cf.id, [])
              specialistMap.get(cf.id)!.push({
                professional: p, forte_label: cf.label, forte_key: cf.id, vote_count: customPersData.vote_count,
              })
            }
          }
        }
      }
    }

    // Sort by selected mode
    if (rankMode === 'active') {
      results.sort((a, b) => b.rate - a.rate)
    } else {
      results.sort((a, b) => b.vote_count - a.vote_count)
    }

    const filtered = selectedCategory === 'all' ? results : results.filter(r => r.vote_count > 0)
    setRankings(filtered)

    const allSpecialists: SpecialistEntry[] = []
    specialistMap.forEach((entries) => {
      entries.sort((a, b) => b.vote_count - a.vote_count)
      allSpecialists.push(...entries)
    })
    setSpecialists(allSpecialists)

    setLoading(false)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">プロを探す</h1>
      <p className="text-sm text-gray-500 mb-6">プルーフや人柄で、あなたに合うプロを見つけよう</p>

      {/* 強み / パーソナリティ タブ */}
      <div className="flex mb-4 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setTab('result')}
          className={`flex-1 py-3 rounded-md text-sm font-medium transition ${
            tab === 'result'
              ? 'bg-[#1A1A2E] text-white shadow'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          強みで探す
        </button>
        <button
          onClick={() => setTab('personality')}
          className={`flex-1 py-3 rounded-md text-sm font-medium transition ${
            tab === 'personality'
              ? 'bg-[#C4A35A] text-white shadow'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          パーソナリティで探す
        </button>
      </div>

      {/* 総合 / アクティブ 切り替え */}
      <div className="flex mb-6 gap-2">
        <button
          onClick={() => setRankMode('total')}
          className={`px-4 py-2 rounded-full text-xs font-medium transition ${
            rankMode === 'total'
              ? 'bg-[#1A1A2E] text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          総合ランキング
        </button>
        <button
          onClick={() => setRankMode('active')}
          className={`px-4 py-2 rounded-full text-xs font-medium transition ${
            rankMode === 'active'
              ? 'bg-[#1A1A2E] text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          アクティブランキング
        </button>
      </div>

      {/* カテゴリフィルター */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
        {currentCategories.map(cat => (
          <button
            key={cat.key}
            onClick={() => setSelectedCategory(cat.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
              selectedCategory === cat.key
                ? tab === 'result'
                  ? 'bg-[#1A1A2E] text-white'
                  : 'bg-[#C4A35A] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* ランキング */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">読み込み中...</div>
      ) : (
        <>
          {rankings.length === 0 ? (
            <p className="text-center text-gray-400 py-12">
              {selectedCategory === 'all' ? 'まだプロが登録されていません' : 'このカテゴリにはまだプルーフがありません'}
            </p>
          ) : (
            <div className="space-y-3 mb-10">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                
                {selectedCategory === 'all'
                  ? (tab === 'result'
                    ? (rankMode === 'active' ? '強みプルーフ アクティブランキング' : '強みプルーフ 総合ランキング')
                    : (rankMode === 'active' ? 'パーソナリティプルーフ アクティブランキング' : 'パーソナリティプルーフ 総合ランキング'))
                  : `${currentCategories.find(c => c.key === selectedCategory)?.label} ランキング`
                }
              </h2>
              {rankMode === 'active' && (
                <p className="text-xs text-gray-400 -mt-1 mb-2">プルーフ数 ÷ 登録日数 = 1日あたりの獲得ペース</p>
              )}
              {rankings.map((r, i) => {
                const p = r.professional
                return (
                  <a key={p.id} href={`/card/${p.id}`}
                    className="flex items-center gap-4 bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition">
                    <div className={`text-lg font-bold w-8 text-center ${
                      i === 0 ? 'text-[#C4A35A]' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700' : 'text-gray-300'
                    }`}>
                      {i + 1}
                    </div>
                    {p.photo_url ? (
                      <img src={p.photo_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#1A1A2E] flex items-center justify-center text-white font-bold">
                        {p.name.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[#1A1A2E] flex items-center gap-2 flex-wrap">
                        {p.name}
                        {p.is_founding_member && (
                          <span className="text-xs px-2 py-0.5 bg-[#C4A35A] text-white rounded-full">FM</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 truncate">{p.title}{p.location ? ` · ${p.location}` : ''}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {rankMode === 'active' ? (
                        <>
                          <div className={`text-xl font-bold ${tab === 'result' ? 'text-[#1A1A2E]' : 'text-[#C4A35A]'}`}>
                            {r.rate.toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-400">
                            {r.vote_count}件 / {r.days_active}日
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={`text-xl font-bold ${tab === 'result' ? 'text-[#1A1A2E]' : 'text-[#C4A35A]'}`}>
                            {r.vote_count}
                          </div>
                          <div className="text-xs text-gray-400">
                            {selectedCategory === 'all' ? 'プルーフ' : `/ ${r.total_votes}`}
                          </div>
                        </>
                      )}
                    </div>
                  </a>
                )
              })}
            </div>
          )}

          {/* スペシャリスト セクション */}
          {specialists.length > 0 && (
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">⭐</span>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                  スペシャリスト
                </h2>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                プロが独自に設定した専門分野でプルーフを獲得しています
              </p>

              {(() => {
                const grouped: Map<string, SpecialistEntry[]> = new Map()
                specialists.forEach(s => {
                  if (!grouped.has(s.forte_key)) grouped.set(s.forte_key, [])
                  grouped.get(s.forte_key)!.push(s)
                })

                return Array.from(grouped.entries()).map(([key, entries]) => (
                  <div key={key} className="mb-6">
                    <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-3 ${
                      tab === 'result'
                        ? 'bg-[#1A1A2E]/10 text-[#1A1A2E]'
                        : 'bg-[#C4A35A]/10 text-[#C4A35A]'
                    }`}>
                      {entries[0].forte_label}
                    </div>
                    <div className="space-y-2">
                      {entries.map((s, i) => {
                        const p = s.professional
                        return (
                          <a key={`${p.id}-${s.forte_key}`} href={`/card/${p.id}`}
                            className="flex items-center gap-4 bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition border-l-4 border-[#C4A35A]">
                            <div className="text-sm font-bold text-[#C4A35A] w-6 text-center">{i + 1}</div>
                            {p.photo_url ? (
                              <img src={p.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-[#1A1A2E] flex items-center justify-center text-white text-sm font-bold">
                                {p.name.charAt(0)}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-[#1A1A2E] text-sm">{p.name}</div>
                              <div className="text-xs text-gray-500 truncate">{p.title}</div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-lg font-bold text-[#C4A35A]">{s.vote_count}</div>
                              <div className="text-xs text-gray-400">プルーフ</div>
                            </div>
                          </a>
                        )
                      })}
                    </div>
                  </div>
                ))
              })()}
            </div>
          )}
        </>
      )}
    </div>
  )
}
