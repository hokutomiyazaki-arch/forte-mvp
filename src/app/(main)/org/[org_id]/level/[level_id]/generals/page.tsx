'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

export default function GeneralsPage() {
  const params = useParams()
  const orgId = params.org_id as string
  const levelId = params.level_id as string
  const [loading, setLoading] = useState(true)
  const [org, setOrg] = useState<any>(null)
  const [level, setLevel] = useState<any>(null)
  const [generals, setGenerals] = useState<any[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    const res = await fetch(`/api/org/${orgId}/level/${levelId}`)
    const data = await res.json()
    setOrg(data.org)
    setLevel(data.level)
    setGenerals(data.generals || [])
    setLoading(false)
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="animate-spin w-8 h-8 border-2 border-[#C4A35A] border-t-transparent rounded-full mx-auto" />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => window.location.href = `/org/${orgId}/level/${levelId}`}
        className="text-sm text-gray-400 hover:text-gray-600 mb-6 flex items-center gap-1"
      >
        ← {level?.name}に戻る
      </button>

      <h1 className="text-xl font-bold text-[#1A1A2E] mb-1">一般認定者一覧</h1>
      <p className="text-sm text-gray-400 mb-6">{org?.name} · {generals.length}名</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {generals.map((g: any, i: number) => (
          <div
            key={g.user_id || i}
            className="block p-4 rounded-xl"
            style={{ backgroundColor: '#FAFAF7', border: '1px solid #E5E5E0' }}
          >
            <div className="flex flex-col items-center text-center">
              {g.photo_url ? (
                <img src={g.photo_url} alt={g.display_name}
                  className="w-16 h-16 rounded-full object-cover mb-2" />
              ) : (
                <div className="w-16 h-16 rounded-full mb-2 flex items-center justify-center"
                     style={{ backgroundColor: '#E5E5E0' }}>
                  <span style={{ fontSize: '24px', color: '#888' }}>
                    {g.display_name?.charAt(0) || '?'}
                  </span>
                </div>
              )}
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A1A2E' }}>
                {g.display_name}
              </p>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full mt-1">
                一般会員
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
