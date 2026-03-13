'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

export default function OrgCommentsPage() {
  const params = useParams()
  const orgId = params.org_id as string
  const [loading, setLoading] = useState(true)
  const [org, setOrg] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const res = await fetch(`/api/org/${orgId}/comments`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'データの取得に失敗しました')
      }
      const data = await res.json()
      setOrg(data.org)
      setComments(data.comments || [])
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* 戻るリンク */}
      <a
        href={`/org/${orgId}`}
        className="inline-flex items-center text-sm text-gray-400 hover:text-[#C4A35A] transition mb-6"
      >
        ← {org.name}
      </a>

      <h1 className="text-lg font-bold text-[#1A1A2E] mb-2">コメント一覧</h1>
      <p className="text-xs text-gray-400 mb-6">{comments.length}件のコメント</p>

      {comments.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-gray-400 text-sm">まだコメントはありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((c: any, i: number) => (
            <div
              key={i}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
            >
              <p className="text-sm text-gray-700 leading-relaxed mb-3">{c.comment}</p>
              <div className="flex items-center justify-between">
                <a
                  href={`/card/${c.professional_id}`}
                  className="text-xs font-medium text-[#C4A35A] hover:opacity-80 transition"
                >
                  {c.professional_name} へ →
                </a>
                <span className="text-xs text-gray-300">
                  {new Date(c.created_at).toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
