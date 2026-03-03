'use client'
import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'

export default function OrgInvitePage() {
  const [loading, setLoading] = useState(true)
  const [org, setOrg] = useState<any>(null)
  const [badges, setBadges] = useState<any[]>([])
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { user: clerkUser, isLoaded: authLoaded } = useUser()
  const authUser = clerkUser ? { id: clerkUser.id } : null

  useEffect(() => {
    if (!authLoaded) return
    if (!authUser) { window.location.href = '/login?role=pro'; return }
    load()
  }, [authLoaded, authUser])

  async function load() {
    try {
      const res = await fetch('/api/org-dashboard')
      if (!res.ok) throw new Error('データの取得に失敗しました')
      const data = await res.json()

      if (!data.org) {
        window.location.href = '/org/register'
        return
      }

      setOrg(data.org)
      setBadges(data.badges || [])
    } catch (err: any) {
      setError(err.message || 'データの取得に失敗しました')
    }
    setLoading(false)
  }

  function copyClaimUrl(claimToken: string, badgeId: string) {
    const url = `${window.location.origin}/badge/claim/${claimToken}`
    navigator.clipboard.writeText(url)
    setCopiedId(badgeId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#C4A35A] border-t-transparent rounded-full mx-auto" />
        <p className="text-gray-400 mt-4 text-sm">読み込み中...</p>
      </div>
    )
  }

  if (!org) return null

  const activeBadges = badges.filter((b: any) => b.claim_url_active && b.claim_token)

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <button
        onClick={() => window.location.href = '/org/dashboard'}
        className="text-sm text-gray-400 hover:text-gray-600 mb-6 flex items-center gap-1"
      >
        ← ダッシュボードに戻る
      </button>

      <h1 className="text-xl font-bold text-[#1A1A2E] mb-1">メンバーを追加する</h1>
      <p className="text-sm text-gray-500 mb-8 leading-relaxed">
        以下のURLをプロに共有してください。<br />
        URLからバッジを取得すると、自動的にメンバーに追加されます。
      </p>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4">
          {error}
        </div>
      )}

      {activeBadges.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-gray-500 text-sm mb-4">
            {badges.length === 0
              ? 'バッジがまだ作成されていません。バッジを作成するとメンバー追加URLが生成されます。'
              : '有効な取得URLがありません。バッジ管理ページで取得URLを有効にしてください。'
            }
          </p>
          <button
            onClick={() => window.location.href = badges.length === 0 ? '/org/dashboard/badges/new' : '/org/dashboard/badges'}
            className="px-6 py-3 bg-[#1A1A2E] text-white font-medium rounded-xl hover:bg-[#2a2a4e] transition text-sm"
          >
            {badges.length === 0 ? 'バッジを作成する' : 'バッジ管理へ'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {activeBadges.map((badge: any) => (
            <div key={badge.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-4">
                {badge.image_url ? (
                  <img src={badge.image_url} alt={badge.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#C4A35A] to-[#E8D5A0] flex items-center justify-center text-white font-bold flex-shrink-0">
                    {badge.name.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-[#1A1A2E]">{badge.name}</p>
                  {badge.description && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{badge.description}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 truncate font-mono">
                  {window.location.origin}/badge/claim/{badge.claim_token.slice(0, 8)}...
                </div>
                <button
                  onClick={() => copyClaimUrl(badge.claim_token, badge.id)}
                  className="px-4 py-2 bg-[#1A1A2E] text-white rounded-lg text-xs hover:bg-[#2a2a4e] transition whitespace-nowrap font-medium"
                >
                  {copiedId === badge.id ? 'コピー済!' : 'URLをコピー'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
