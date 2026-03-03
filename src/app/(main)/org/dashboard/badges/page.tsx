'use client'
import { useState, useEffect } from 'react'
import { db } from '@/lib/db'
import { useUser } from '@clerk/nextjs'

export default function OrgBadgesPage() {
  const [loading, setLoading] = useState(true)
  const [org, setOrg] = useState<any>(null)
  const [levels, setLevels] = useState<any[]>([])
  const [claimCounts, setClaimCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // アコーディオン
  const [expandedBadge, setExpandedBadge] = useState<string | null>(null)
  // 剥奪
  const [revoking, setRevoking] = useState<string | null>(null)

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
      setLevels(data.badges || [])
      setClaimCounts(data.badgeHolderCounts || {})
    } catch (err: any) {
      setError(err.message || 'データの取得に失敗しました')
    }
    setLoading(false)
  }

  async function toggleClaimUrl(levelId: string, currentActive: boolean) {
    try {
      const { error: updateError } = await db.update(
        'credential_levels',
        { claim_url_active: !currentActive },
        { id: levelId }
      )

      if (updateError) throw new Error(updateError.message)

      setLevels(prev =>
        prev.map(l => l.id === levelId ? { ...l, claim_url_active: !currentActive } : l)
      )
    } catch (err: any) {
      alert('更新に失敗しました: ' + err.message)
    }
  }

  function copyClaimUrl(claimToken: string, levelId: string) {
    const url = `${window.location.origin}/badge/claim/${claimToken}`
    navigator.clipboard.writeText(url)
    setCopiedId(levelId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleRevoke(professionalId: string, badgeLevelId: string, professionalName: string) {
    if (!confirm(`${professionalName} さんのこのバッジを削除しますか？\n\n※ この操作は取り消せません。再度バッジを付与するにはclaim URLからの再取得が必要です。`)) {
      return
    }

    setRevoking(professionalId + '_' + badgeLevelId)
    try {
      const res = await fetch(
        `/api/org-badge-revoke?professional_id=${professionalId}&organization_id=${org.id}&badge_level_id=${badgeLevelId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('削除に失敗しました')

      // ローカルstateから削除
      setLevels(prev =>
        prev.map(l =>
          l.id === badgeLevelId
            ? { ...l, holders: (l.holders || []).filter((h: any) => h.professional_id !== professionalId) }
            : l
        )
      )
      setClaimCounts(prev => ({
        ...prev,
        [badgeLevelId]: Math.max(0, (prev[badgeLevelId] || 0) - 1),
      }))
    } catch (error: any) {
      alert(error.message)
    } finally {
      setRevoking(null)
    }
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

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <button
        onClick={() => window.location.href = '/org/dashboard'}
        className="text-sm text-gray-400 hover:text-gray-600 mb-6 flex items-center gap-1"
      >
        ← ダッシュボードに戻る
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#1A1A2E]">バッジ管理</h1>
          <p className="text-sm text-gray-500 mt-1">{org.name}のバッジ一覧</p>
        </div>
        <button
          onClick={() => window.location.href = '/org/dashboard/badges/new'}
          className="px-4 py-2 bg-[#1A1A2E] text-white font-medium rounded-xl hover:bg-[#2a2a4e] transition text-sm"
        >
          + 新規作成
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4">
          {error}
        </div>
      )}

      {levels.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="text-4xl mb-3">🎖️</div>
          <p className="text-gray-500 text-sm mb-4">
            まだバッジがありません。<br />
            バッジを作成して、プロに取得URLを共有しましょう。
          </p>
          <button
            onClick={() => window.location.href = '/org/dashboard/badges/new'}
            className="px-6 py-3 bg-[#C4A35A] text-white font-medium rounded-xl hover:bg-[#b3944f] transition text-sm"
          >
            最初のバッジを作成
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {levels.map(level => (
            <div
              key={level.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
            >
              <div className="flex items-start gap-4">
                {/* バッジ画像 */}
                {level.image_url ? (
                  <img
                    src={level.image_url}
                    alt={level.name}
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#C4A35A] to-[#E8D5A0] flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                    {level.name.charAt(0)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-[#1A1A2E] truncate">
                    {level.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    取得者: {claimCounts[level.id] || 0}名
                  </p>
                  {level.description && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                      {level.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Claim URL */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">取得URL</span>
                  <button
                    onClick={() => toggleClaimUrl(level.id, level.claim_url_active)}
                    className={`text-xs px-2 py-1 rounded-full transition ${
                      level.claim_url_active
                        ? 'bg-green-50 text-green-600'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {level.claim_url_active ? '✓ 有効' : '無効'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 truncate font-mono">
                    /badge/claim/{level.claim_token?.slice(0, 8)}...
                  </div>
                  <button
                    onClick={() => copyClaimUrl(level.claim_token, level.id)}
                    className="px-3 py-2 bg-[#1A1A2E] text-white rounded-lg text-xs hover:bg-[#2a2a4e] transition whitespace-nowrap"
                  >
                    {copiedId === level.id ? 'コピー済!' : 'コピー'}
                  </button>
                </div>
              </div>

              {/* 取得者アコーディオン */}
              <div style={{ marginTop: '12px' }}>
                <button
                  onClick={() => setExpandedBadge(expandedBadge === level.id ? null : level.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#C4A35A', fontSize: '13px', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: 0,
                  }}
                >
                  {org.type === 'store' ? 'バッジ取得者一覧' : '認定者一覧'} ({level.holders?.length || 0}名)
                  <span style={{ transform: expandedBadge === level.id ? 'rotate(180deg)' : 'none', transition: '0.2s', display: 'inline-block' }}>
                    ▼
                  </span>
                </button>

                {expandedBadge === level.id && (
                  <div style={{
                    marginTop: '12px', padding: '12px',
                    backgroundColor: '#F5F5F0', borderRadius: '12px',
                  }}>
                    {(!level.holders || level.holders.length === 0) ? (
                      <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>まだ取得者がいません</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {level.holders.map((holder: any) => (
                          <div
                            key={holder.professional_id}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '8px 12px', backgroundColor: '#fff', borderRadius: '8px',
                              border: '1px solid #E5E5E0',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {holder.professionals?.photo_url ? (
                                <img
                                  src={holder.professionals.photo_url}
                                  alt=""
                                  style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                                />
                              ) : (
                                <div style={{
                                  width: '32px', height: '32px', borderRadius: '50%',
                                  backgroundColor: '#E5E5E0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '14px', color: '#888',
                                }}>
                                  {holder.professionals?.name?.charAt(0) || '?'}
                                </div>
                              )}
                              <div>
                                <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A2E', margin: 0 }}>
                                  {holder.professionals?.name}
                                </p>
                                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
                                  {holder.accepted_at ? new Date(holder.accepted_at).toLocaleDateString('ja-JP') : ''}
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={() => handleRevoke(
                                holder.professional_id,
                                level.id,
                                holder.professionals?.name || ''
                              )}
                              disabled={revoking === holder.professional_id + '_' + level.id}
                              style={{
                                background: 'none', border: '1px solid #E53E3E',
                                color: '#E53E3E', fontSize: '12px', padding: '4px 10px',
                                borderRadius: '6px', cursor: 'pointer',
                                opacity: revoking === holder.professional_id + '_' + level.id ? 0.5 : 1,
                              }}
                            >
                              {revoking === holder.professional_id + '_' + level.id ? '削除中...' : '認定削除'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
