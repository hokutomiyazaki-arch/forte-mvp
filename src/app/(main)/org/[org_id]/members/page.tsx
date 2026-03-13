'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

const ORG_TYPE_LABELS: Record<string, string> = {
  store: '所属プロフェッショナル',
  credential: '認定プロフェッショナル',
  education: '修了プロフェッショナル',
}

export default function OrgMembersPage() {
  const params = useParams()
  const orgId = params.org_id as string
  const [loading, setLoading] = useState(true)
  const [org, setOrg] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const res = await fetch(`/api/org/${orgId}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'データの取得に失敗しました')
      }
      const data = await res.json()
      setOrg(data.org)
      setMembers(data.members || [])
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

  if (error || !org) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-400">{error || '団体が見つかりませんでした'}</p>
      </div>
    )
  }

  const heading = ORG_TYPE_LABELS[org.type] || ORG_TYPE_LABELS.store

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* 戻るリンク */}
      <a
        href={`/org/${orgId}`}
        className="inline-flex items-center text-sm text-gray-400 hover:text-[#C4A35A] transition mb-6"
      >
        ← {org.name}
      </a>

      <h1 className="text-lg font-bold text-[#1A1A2E] mb-6">{heading}</h1>

      {members.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">メンバー情報はまだありません</p>
      ) : (
        <div className="grid gap-3">
          {members.map((m: any) => (
            <a
              key={m.professional_id}
              href={`/card/${m.professional_id}`}
              className="flex items-center gap-4 bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-[#C4A35A] transition"
            >
              {m.professionals?.photo_url ? (
                <img
                  src={m.professionals.photo_url}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-sm text-gray-400 flex-shrink-0">
                  {m.professionals?.name?.charAt(0) || '?'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[#1A1A2E] truncate">
                  {m.professionals?.name || ''}
                </div>
                {m.professionals?.title && (
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    {m.professionals.title}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-bold text-[#C4A35A]">{m.total_votes || 0}</span>
                <span className="text-xs text-gray-400">プルーフ</span>
              </div>
              <span className="text-gray-300 text-sm flex-shrink-0">→</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
