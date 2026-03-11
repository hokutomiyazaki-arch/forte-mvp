'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

export default function LevelDetailPage() {
  const params = useParams()
  const orgId = params.org_id as string
  const levelId = params.level_id as string
  const [loading, setLoading] = useState(true)
  const [org, setOrg] = useState<any>(null)
  const [level, setLevel] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [generals, setGenerals] = useState<any[]>([])
  const [generalCount, setGeneralCount] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const res = await fetch(`/api/org/${orgId}/level/${levelId}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'データの取得に失敗しました')
      }
      const data = await res.json()
      setOrg(data.org)
      setLevel(data.level)
      setMembers(data.professionals || [])
      setGenerals(data.generals || [])
      setGeneralCount(data.general_count || 0)
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
            {members.reduce((s: number, m: any) => s + (m.total_votes || 0), 0)}
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
              key={m.professional_id}
              href={`/card/${m.professional_id}`}
              className="block p-4 rounded-xl transition-shadow hover:shadow-md"
              style={{ backgroundColor: '#FAFAF7', border: '1px solid #E5E5E0' }}
            >
              <div className="flex flex-col items-center text-center">
                {m.photo_url ? (
                  <img
                    src={m.photo_url}
                    alt={m.professional_name}
                    className="w-16 h-16 rounded-full object-cover mb-2"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full mb-2 flex items-center justify-center"
                       style={{ backgroundColor: '#E5E5E0' }}>
                    <span style={{ fontSize: '24px', color: '#888' }}>
                      {m.professional_name?.charAt(0) || '?'}
                    </span>
                  </div>
                )}
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A1A2E' }}>
                  {m.professional_name}
                </p>
                {m.title && (
                  <p style={{ fontSize: '12px', color: '#888', marginTop: '2px' }} className="truncate w-full">
                    {m.title}
                  </p>
                )}
                <p style={{ fontSize: '11px', color: '#C4A35A', marginTop: '4px', fontWeight: 600 }}>
                  {m.total_votes || 0}票
                </p>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* 一般認定者まとめカード */}
      {generalCount > 0 && (
        <div className="mt-6">
          <a
            href={`/org/${orgId}/level/${levelId}/generals`}
            className="block p-4 rounded-xl transition-shadow hover:shadow-md"
            style={{ backgroundColor: '#F5F5F0', border: '1px solid #E5E5E0' }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full mb-2 flex items-center justify-center"
                   style={{ backgroundColor: '#E5E5E0' }}>
                <span style={{ fontSize: '20px', color: '#888' }}>👥</span>
              </div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A1A2E' }}>
                一般認定者
              </p>
              <p style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                {generalCount}名
              </p>
              <p style={{ fontSize: '11px', color: '#C4A35A', marginTop: '4px', fontWeight: 600 }}>
                一覧を見る →
              </p>
            </div>
          </a>
        </div>
      )}
    </div>
  )
}
