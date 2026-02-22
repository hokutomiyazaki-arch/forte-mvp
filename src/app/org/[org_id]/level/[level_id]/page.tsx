'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams } from 'next/navigation'

export default function LevelDetailPage() {
  const supabase = createClient() as any
  const params = useParams()
  const orgId = params.org_id as string
  const levelId = params.level_id as string
  const [loading, setLoading] = useState(true)
  const [org, setOrg] = useState<any>(null)
  const [level, setLevel] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      // 団体情報
      const { data: orgData } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .maybeSingle()

      if (!orgData) {
        setError('団体が見つかりませんでした')
        setLoading(false)
        return
      }
      setOrg(orgData)

      // レベル情報
      const { data: levelData } = await supabase
        .from('credential_levels')
        .select('*')
        .eq('id', levelId)
        .eq('organization_id', orgId)
        .maybeSingle()

      if (!levelData) {
        setError('バッジが見つかりませんでした')
        setLoading(false)
        return
      }
      setLevel(levelData)

      // 認定者一覧（org_members + professionals + vote集計）
      const { data: memberData } = await supabase
        .from('org_members')
        .select('professional_id, professionals(id, name, photo_url, title)')
        .eq('organization_id', orgId)
        .eq('credential_level_id', levelId)
        .eq('status', 'active')

      if (memberData) {
        // 投票数を別途取得
        const proIds = memberData
          .filter((m: any) => m.professionals)
          .map((m: any) => m.professionals.id)

        let voteCounts: Record<string, number> = {}
        if (proIds.length > 0) {
          const { data: voteData } = await supabase
            .from('vote_summary')
            .select('professional_id, vote_count')
            .in('professional_id', proIds)

          if (voteData) {
            for (const v of voteData) {
              voteCounts[v.professional_id] = (voteCounts[v.professional_id] || 0) + v.vote_count
            }
          }
        }

        const enriched = memberData
          .filter((m: any) => m.professionals)
          .map((m: any) => ({
            ...m.professionals,
            total_votes: voteCounts[m.professionals.id] || 0,
          }))
          .sort((a: any, b: any) => b.total_votes - a.total_votes)

        setMembers(enriched)
      }
    } catch (err: any) {
      setError(err.message || 'データの取得に失敗しました')
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#C4A35A] border-t-transparent rounded-full mx-auto" />
      </div>
    )
  }

  if (error || !org || !level) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-400">{error || 'データが見つかりませんでした'}</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => window.location.href = `/org/${orgId}`}
        className="text-sm text-gray-400 hover:text-gray-600 mb-6 flex items-center gap-1"
      >
        ← {org.name}に戻る
      </button>

      {/* レベルヘッダー */}
      <div className="text-center mb-8">
        {level.image_url ? (
          <img src={level.image_url} alt={level.name} className="w-20 h-20 rounded-2xl object-cover mx-auto mb-3" />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#C4A35A] to-[#E8D5A0] flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3">
            {level.name.charAt(0)}
          </div>
        )}
        <h1 className="text-xl font-bold text-[#1A1A2E]">{level.name}</h1>
        <p className="text-sm text-gray-400 mt-1">{org.name}</p>
        {level.description && (
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">{level.description}</p>
        )}
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
          <div className="text-2xl font-bold text-[#1A1A2E]">{members.length}</div>
          <div className="text-xs text-gray-400 mt-1">
            {org.type === 'credential' ? '認定者' : '修了者'}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
          <div className="text-2xl font-bold text-[#C4A35A]">
            {members.reduce((s: number, m: any) => s + m.total_votes, 0)}
          </div>
          <div className="text-xs text-gray-400 mt-1">プルーフ</div>
        </div>
      </div>

      {/* 認定者一覧 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-bold text-[#1A1A2E] mb-4">
          {org.type === 'credential' ? '認定者一覧' : '修了者一覧'}
        </h2>

        {members.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">まだ取得者がいません</p>
        ) : (
          <div className="space-y-3">
            {members.map((m: any) => (
              <a
                key={m.id}
                href={`/card/${m.id}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition"
              >
                {m.photo_url ? (
                  <img src={m.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm text-gray-400">
                    {m.name?.charAt(0) || '?'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#1A1A2E] truncate">{m.name}</div>
                  {m.title && (
                    <div className="text-xs text-gray-400 truncate">{m.title}</div>
                  )}
                </div>
                <div className="text-xs text-gray-400 flex-shrink-0">
                  {m.total_votes}票
                </div>
                <span className="text-gray-300 text-sm">→</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
