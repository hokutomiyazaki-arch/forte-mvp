'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getSessionSafe } from '@/lib/auth-helper'

export default function OrgBadgesPage() {
  const supabase = createClient() as any
  const [loading, setLoading] = useState(true)
  const [org, setOrg] = useState<any>(null)
  const [levels, setLevels] = useState<any[]>([])
  const [claimCounts, setClaimCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const { user } = await getSessionSafe()
      if (!user) {
        window.location.href = '/login?role=pro'
        return
      }

      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (orgError) throw orgError
      if (!orgData) {
        window.location.href = '/org/register'
        return
      }

      setOrg(orgData)

      // バッジ一覧取得
      const { data: levelData, error: levelError } = await supabase
        .from('credential_levels')
        .select('*')
        .eq('organization_id', orgData.id)
        .order('sort_order', { ascending: true })

      if (levelError) throw levelError
      setLevels(levelData || [])

      // 各バッジの取得者数（org_membersからcredential_level_idごとにCOUNT）
      if (levelData && levelData.length > 0) {
        const { data: memberData } = await supabase
          .from('org_members')
          .select('credential_level_id')
          .eq('organization_id', orgData.id)
          .eq('status', 'active')
          .not('credential_level_id', 'is', null)

        const counts: Record<string, number> = {}
        if (memberData) {
          for (const m of memberData) {
            if (m.credential_level_id) {
              counts[m.credential_level_id] = (counts[m.credential_level_id] || 0) + 1
            }
          }
        }
        setClaimCounts(counts)
      }
    } catch (err: any) {
      setError(err.message || 'データの取得に失敗しました')
    }
    setLoading(false)
  }

  async function toggleClaimUrl(levelId: string, currentActive: boolean) {
    try {
      const { error: updateError } = await supabase
        .from('credential_levels')
        .update({ claim_url_active: !currentActive })
        .eq('id', levelId)

      if (updateError) throw updateError

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
                    /badge/claim/{level.claim_token.slice(0, 8)}...
                  </div>
                  <button
                    onClick={() => copyClaimUrl(level.claim_token, level.id)}
                    className="px-3 py-2 bg-[#1A1A2E] text-white rounded-lg text-xs hover:bg-[#2a2a4e] transition whitespace-nowrap"
                  >
                    {copiedId === level.id ? 'コピー済!' : 'コピー'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
