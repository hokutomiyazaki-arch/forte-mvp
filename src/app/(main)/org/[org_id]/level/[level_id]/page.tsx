'use client'
import { useState, useEffect } from 'react'
import { db } from '@/lib/db'
import { useParams } from 'next/navigation'

export default function LevelDetailPage() {
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
      // 団体情報 + レベル情報を並列取得
      const [orgResult, levelResult] = await Promise.all([
        db.select('organizations', {
          eq: { id: orgId },
          maybeSingle: true,
        }),
        db.select('org_badge_levels', {
          eq: { id: levelId, organization_id: orgId },
          maybeSingle: true,
        }),
      ])

      if (!orgResult.data) {
        setError('団体が見つかりませんでした')
        setLoading(false)
        return
      }
      setOrg(orgResult.data)

      if (!levelResult.data) {
        setError('バッジが見つかりませんでした')
        setLoading(false)
        return
      }
      setLevel(levelResult.data)

      // 認定者一覧（org_members + professionals JOIN）
      const { data: memberData } = await db.select('org_members', {
        select: 'professional_id, professionals(id, name, photo_url, title)',
        eq: { organization_id: orgId, credential_level_id: levelId, status: 'active' },
      })

      if (memberData) {
        // 投票数を別途取得
        const proIds = memberData
          .filter((m: any) => m.professionals)
          .map((m: any) => m.professionals.id)

        let voteCounts: Record<string, number> = {}
        if (proIds.length > 0) {
          const { data: voteData } = await db.select('vote_summary', {
            select: 'professional_id, vote_count',
            in: { professional_id: proIds },
          })

          if (voteData) {
            for (const v of voteData as any[]) {
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

      {/* 認定者一覧（カード形式） */}
      <h2 className="text-sm font-bold text-[#1A1A2E] mb-4">
        {org.type === 'credential' ? '認定者一覧' : '修了者一覧'}
      </h2>

      {members.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-gray-400 text-sm">まだ取得者がいません</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {members.map((m: any) => (
            <a
              key={m.id}
              href={`/card/${m.id}`}
              className="block p-4 rounded-xl transition-shadow hover:shadow-md"
              style={{ backgroundColor: '#FAFAF7', border: '1px solid #E5E5E0' }}
            >
              <div className="flex flex-col items-center text-center">
                {m.photo_url ? (
                  <img
                    src={m.photo_url}
                    alt={m.name}
                    className="w-16 h-16 rounded-full object-cover mb-2"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full mb-2 flex items-center justify-center"
                       style={{ backgroundColor: '#E5E5E0' }}>
                    <span style={{ fontSize: '24px', color: '#888' }}>
                      {m.name?.charAt(0) || '?'}
                    </span>
                  </div>
                )}
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A1A2E' }}>
                  {m.name}
                </p>
                {m.title && (
                  <p style={{ fontSize: '12px', color: '#888', marginTop: '2px' }} className="truncate w-full">
                    {m.title}
                  </p>
                )}
                <p style={{ fontSize: '11px', color: '#C4A35A', marginTop: '4px', fontWeight: 600 }}>
                  {m.total_votes}票
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
