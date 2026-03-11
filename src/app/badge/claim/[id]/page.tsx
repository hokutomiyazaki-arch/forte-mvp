'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams } from 'next/navigation'
import { useUser, SignInButton } from '@clerk/nextjs'

type Status = 'loading' | 'show_badge' | 'claiming' | 'invalid' | 'already' | 'success' | 'error'

function ClaimContent() {
  const params = useParams()
  const credentialLevelId = params.id as string
  const { user: clerkUser, isLoaded: authLoaded } = useUser()

  const [status, setStatus] = useState<Status>('loading')
  const [badge, setBadge] = useState<{
    name: string
    description: string | null
    image_url: string | null
    org_name: string
    org_id: string
  } | null>(null)

  // Step1: バッジ情報をAPIから取得（ログイン不要）
  useEffect(() => {
    fetchBadgeInfo()
  }, [credentialLevelId])

  // Step2: ログインが完了したら自動でclaimを実行
  useEffect(() => {
    if (!authLoaded || !clerkUser) return
    if (status === 'show_badge') {
      executeClaim()
    }
  }, [authLoaded, clerkUser, status])

  async function fetchBadgeInfo() {
    try {
      const res = await fetch(`/api/badge/info?id=${credentialLevelId}`)
      const data = await res.json()
      if (data.error || !data.badge) { setStatus('invalid'); return }
      setBadge(data.badge)
      setStatus('show_badge')
    } catch {
      setStatus('invalid')
    }
  }

  async function executeClaim() {
    if (!clerkUser) return
    setStatus('claiming')
    try {
      const res = await fetch('/api/badge/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialLevelId }),
      })
      const data = await res.json()
      if (data.error === 'already') { setStatus('already'); return }
      if (data.error) { setStatus('error'); return }
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  // バッジ情報読み込み中
  if (status === 'loading') {
    return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  }

  // 無効なURL
  if (status === 'invalid') {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4">❌</div>
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-4">無効なバッジリンク</h1>
        <p className="text-gray-500">このリンクは無効です。</p>
      </div>
    )
  }

  // バッジ取得中（ログイン直後の自動処理）
  if (status === 'claiming') {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        {badge?.image_url && (
          <img src={badge.image_url} alt={badge.name}
            className="w-28 h-28 mx-auto mb-4 rounded-xl object-cover" />
        )}
        <p className="text-gray-400">バッジを取得中...</p>
      </div>
    )
  }

  // バッジ情報表示（未ログイン or ログイン済みで未取得）
  if (status === 'show_badge' && badge) {
    const isLoggedIn = authLoaded && !!clerkUser
    return (
      <div className="max-w-md mx-auto text-center py-16 px-4">
        {badge.image_url && (
          <img src={badge.image_url} alt={badge.name}
            className="w-28 h-28 mx-auto mb-6 rounded-xl object-cover shadow-md" />
        )}
        <p className="text-sm text-[#C4A35A] font-medium mb-2">{badge.org_name}</p>
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-3">{badge.name}</h1>
        {badge.description && (
          <p className="text-gray-500 mb-8">{badge.description}</p>
        )}

        {isLoggedIn ? (
          // ログイン済み → ボタンを押すと即claim
          <button
            onClick={executeClaim}
            className="inline-block px-8 py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition"
          >
            バッジを受け取る
          </button>
        ) : (
          // 未ログイン → SignInButtonでポップアップ表示、ログイン後自動でclaim
          <SignInButton mode="modal" fallbackRedirectUrl={`/badge/claim/${credentialLevelId}`}>
            <button className="inline-block px-8 py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition">
              ログインしてバッジを受け取る
            </button>
          </SignInButton>
        )}
      </div>
    )
  }

  // 取得済み
  if (status === 'already' && badge) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        {badge.image_url && (
          <img src={badge.image_url} alt={badge.name}
            className="w-24 h-24 mx-auto mb-4 rounded-xl object-cover" />
        )}
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-4">既に取得済みです</h1>
        <p className="text-gray-500 mb-6">{badge.name} はすでにあなたのプロフィールにあります。</p>
        <a href="/dashboard" className="text-[#C4A35A] hover:underline">ダッシュボードへ</a>
      </div>
    )
  }

  // 取得成功
  if (status === 'success' && badge) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        {badge.image_url && (
          <img src={badge.image_url} alt={badge.name}
            className="w-28 h-28 mx-auto mb-6 rounded-xl object-cover shadow-md" />
        )}
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-4">バッジを獲得しました！</h1>
        <p className="text-lg font-medium text-[#C4A35A] mb-2">{badge.name}</p>
        <p className="text-gray-500 mb-8">{badge.org_name}</p>
        <a href="/dashboard"
          className="inline-block px-8 py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition">
          ダッシュボードで確認する
        </a>
      </div>
    )
  }

  // エラー
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
