'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@clerk/nextjs'

export default function BadgeClaimPage({ params }: { params: { claim_token: string } }) {
  const supabase = createClient() as any
  const [loading, setLoading] = useState(true)
  const [level, setLevel] = useState<any>(null)
  const [org, setOrg] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [professional, setProfessional] = useState<any>(null)
  const [alreadyClaimed, setAlreadyClaimed] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const [error, setError] = useState('')

  const { user: clerkUser, isLoaded: authLoaded } = useUser()
  const authUser = clerkUser ? { id: clerkUser.id } : null

  useEffect(() => {
    if (!authLoaded) return
    load()
  }, [authLoaded])

  async function load() {
    try {
      // バッジ情報取得
      const { data: levelData, error: levelError } = await supabase
        .from('org_badge_levels')
        .select('*, organizations(id, name, type)')
        .eq('claim_token', params.claim_token)
        .maybeSingle()

      if (levelError) throw levelError
      if (!levelData) {
        setError('このバッジは存在しません')
        setLoading(false)
        return
      }

      if (!levelData.claim_url_active) {
        setError('このバッジの取得URLは現在無効です')
        setLoading(false)
        return
      }

      setLevel(levelData)
      setOrg(levelData.organizations)

      // ログインチェック（AuthProviderから）
      const sessionUser = authUser
      if (!sessionUser) {
        setLoading(false)
        return
      }
      setUser(sessionUser)

      // プロ情報取得
      const { data: proData } = await supabase
        .from('professionals')
        .select('id')
        .eq('user_id', sessionUser.id)
        .maybeSingle()

      if (!proData) {
        setLoading(false)
        return
      }
      setProfessional(proData)

      // 既に取得済みか確認
      const { data: existingMember } = await supabase
        .from('org_members')
        .select('id')
        .eq('organization_id', levelData.organization_id)
        .eq('professional_id', proData.id)
        .eq('credential_level_id', levelData.id)
        .eq('status', 'active')
        .maybeSingle()

      if (existingMember) {
        setAlreadyClaimed(true)
      }
    } catch (err: any) {
      setError(err.message || '読み込みに失敗しました')
    }
    setLoading(false)
  }

  async function handleClaim() {
    if (!user || !professional || !level) return
    setClaiming(true)
    setError('')

    try {
      const res = await fetch('/api/badge-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          professionalId: professional.id,
          levelId: level.id,
          organizationId: level.organization_id,
        }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'バッジの取得に失敗しました')

      setClaimed(true)
    } catch (err: any) {
      setError(err.message || 'バッジの取得に失敗しました')
    }
    setClaiming(false)
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#C4A35A] border-t-transparent rounded-full mx-auto" />
        <p className="text-gray-400 mt-4 text-sm">読み込み中...</p>
      </div>
    )
  }

  if (error && !level) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-gray-600">{error}</p>
      </div>
    )
  }

  if (!level || !org) return null

  // 取得完了
  if (claimed) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">バッジを取得しました！</h1>
          <p className="text-sm text-gray-500 mb-2">
            {org.name} — {level.name}
          </p>
          <p className="text-xs text-gray-400 mb-6">
            あなたのプロフィールカードにバッジが表示されます。
          </p>
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="px-6 py-3 bg-[#1A1A2E] text-white font-medium rounded-xl hover:bg-[#2a2a4e] transition text-sm"
          >
            ダッシュボードへ
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        {/* バッジ画像 */}
        {level.image_url ? (
          <img
            src={level.image_url}
            alt={level.name}
            className="w-24 h-24 rounded-2xl object-cover mx-auto mb-4"
          />
        ) : (
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#C4A35A] to-[#E8D5A0] flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
            {level.name.charAt(0)}
          </div>
        )}

        <p className="text-sm text-gray-500 mb-1">{org.name}</p>
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">{level.name}</h1>
        {level.description && (
          <p className="text-sm text-gray-500 mb-6">{level.description}</p>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        {/* 未ログイン */}
        {!user && (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              バッジを取得するにはログインが必要です。
            </p>
            <button
              onClick={() => window.location.href = `/login?role=pro&redirect=/badge/claim/${params.claim_token}`}
              className="w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-xl hover:bg-[#2a2a4e] transition"
            >
              ログインして取得
            </button>
          </div>
        )}

        {/* ログイン済みだがプロ未登録 */}
        {user && !professional && (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              バッジを取得するにはプロ登録が必要です。
            </p>
            <button
              onClick={() => window.location.href = '/register'}
              className="w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-xl hover:bg-[#2a2a4e] transition"
            >
              プロ登録する
            </button>
          </div>
        )}

        {/* 取得済み */}
        {user && professional && alreadyClaimed && (
          <div>
            <div className="bg-green-50 text-green-600 text-sm p-3 rounded-xl mb-4">
              ✓ このバッジは取得済みです
            </div>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="w-full py-3 bg-gray-100 text-gray-600 font-medium rounded-xl hover:bg-gray-200 transition"
            >
              ダッシュボードへ
            </button>
          </div>
        )}

        {/* 取得可能 */}
        {user && professional && !alreadyClaimed && (
          <button
            onClick={handleClaim}
            disabled={claiming}
            className="w-full py-3 bg-[#C4A35A] text-white font-medium rounded-xl hover:bg-[#b3944f] transition disabled:opacity-50"
          >
            {claiming ? '取得中...' : 'このバッジを取得する'}
          </button>
        )}
      </div>
    </div>
  )
}
