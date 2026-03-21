'use client'

import { useEffect, useState } from 'react'

interface Announcement {
  id: string
  title: string
  body: string | null
  link_url: string | null
  link_label: string | null
  banner_type: string
  starts_at: string
  expires_at: string | null
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/announcements')
      .then(res => res.json())
      .then(data => {
        setAnnouncements(data.announcements || [])
        // latest以外はdismiss済み → undismissedを計算
        const undismissedIds = new Set<string>()
        const latest = data.latest
        if (latest) undismissedIds.add(latest.id)
        // unread_countとlatestから、undismissed IDsを推定
        // 簡易: latestだけNEWバッジ表示
        if (latest) setDismissedIds(new Set(
          (data.announcements || [])
            .filter((a: Announcement) => a.id !== latest.id)
            .map((a: Announcement) => a.id)
        ))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  }

  const now = new Date()

  return (
    <div className="max-w-2xl mx-auto">
      <a
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-[#C4A35A] hover:text-[#b3923f] mb-4 transition-colors"
      >
        ← ホームに戻る
      </a>
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-6">お知らせ</h1>

      {announcements.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          お知らせはありません
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map(a => {
            const isExpired = a.expires_at && new Date(a.expires_at) < now
            const isNew = !dismissedIds.has(a.id)

            return (
              <div
                key={a.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
                style={{ opacity: isExpired ? 0.5 : 1 }}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {a.banner_type === 'success' ? '✅' : a.banner_type === 'warning' ? '⚠️' : '📢'}
                    </span>
                    <h2 className="text-base font-bold text-[#1A1A2E]">{a.title}</h2>
                    {isNew && !isExpired && (
                      <span className="text-[10px] font-bold text-white bg-[#E24B4A] px-1.5 py-0.5 rounded-full">
                        NEW
                      </span>
                    )}
                    {isExpired && (
                      <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                        終了
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                    {new Date(a.starts_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                  </span>
                </div>

                {a.body && (
                  <p className="text-sm text-gray-600 leading-relaxed mb-3 whitespace-pre-wrap">
                    {a.body}
                  </p>
                )}

                {a.link_url && !isExpired && (
                  <a
                    href={a.link_url}
                    className="inline-block text-sm font-medium text-[#C4A35A] hover:underline"
                  >
                    {a.link_label || '詳細を見る'} →
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
