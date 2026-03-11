'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'

function ClaimContent() {
  const params = useParams()
  const router = useRouter()
  const credentialLevelId = params.id as string
  const { user: clerkUser, isLoaded: authLoaded } = useUser()

  const [status, setStatus] = useState<'loading' | 'no-login' | 'invalid' | 'already' | 'success' | 'error'>('loading')
  const [badge, setBadge] = useState<{ name: string; description: string | null; image_url: string | null; org_name: string; org_id: string } | null>(null)

  useEffect(() => {
    if (!authLoaded) return

    // 未ログインの場合: 現在のURLをsessionStorageに保存してサインインへ
    if (!clerkUser) {
      sessionStorage.setItem('badge_claim_redirect', window.location.pathname)
      router.push('/sign-in')
      return
    }

    claimBadge()
  }, [authLoaded, clerkUser])

  async function claimBadge() {
    if (!clerkUser) return

    try {
      const res = await fetch('/api/badge/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialLevelId }),
      })
      const data = await res.json()

      if (data.error === 'invalid') { setStatus('invalid'); return }
      if (data.error === 'already') { setBadge(data.badge); setStatus('already'); return }
      if (data.error) { setStatus('error'); return }

      setBadge(data.badge)
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'loading') {
    return <div className="text-center py-16 text-gray-400">バッジを確認中...</div>
  }

  if (status === 'invalid') {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4">❌</div>
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-4">無効なバッジリンク</h1>
        <p className="text-gray-500">このリンクは無効です。</p>
      </div>
    )
  }

  if (status === 'already') {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        {badge?.image_url && <img src={badge.image_url} alt={badge.name} className="w-24 h-24 mx-auto mb-4 rounded-xl object-cover" />}
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-4">既に取得済みです</h1>
        <p className="text-gray-500 mb-6">{badge?.name} は既にあなたのプロフィールに表示されています。</p>
        <a href="/dashboard" className="text-[#C4A35A] hover:underline">ダッシュボードへ</a>
      </div>
    )
  }

  if (status === 'success' && badge) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        {badge.image_url && <img src={badge.image_url} alt={badge.name} className="w-28 h-28 mx-auto mb-4 rounded-xl object-cover" />}
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-4">バッジを獲得しました！</h1>
        <p className="text-lg font-medium text-[#C4A35A] mb-2">{badge.name}</p>
        <p className="text-gray-500 mb-6">{badge.org_name}</p>
        <a href="/dashboard"
          className="inline-block px-8 py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition">
          ダッシュボードで確認
        </a>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto text-center py-16">
      <div className="text-5xl mb-4">⚠️</div>
      <h1 className="text-xl font-bold text-[#1A1A2E] mb-4">エラーが発生しました</h1>
      <p className="text-gray-500">もう一度お試しください。</p>
    </div>
  )
}

export default function BadgeClaimPage() {
  return (
    <Suspense fallback={<div className="text-center py-16">読み込み中...</div>}>
      <ClaimContent />
    </Suspense>
  )
}
