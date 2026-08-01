'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'

const T = {
  dark: '#1A1A2E',
  gold: '#C4A35A',
  textSub: '#555555',
}

const PENDING_INVITE_KEY = 'rp_pending_invite_token'

interface Props {
  token: string
  alreadyRegistered: boolean
}

type Status = 'idle' | 'processing' | 'success' | 'needs_profile' | 'already_used' | 'error'

/**
 * §2-9: 招待ランディングの受諾パネル。
 * - 未ログイン → サインアップ導線（既存 ReferralRequestForm と同じ /sign-up?redirect_url= 方式）
 * - ログイン済み → 登録完了APIを自動実行（冪等）
 * - プロフィール未作成（オンボーディング未完了）→ /onboarding へ誘導 + localStorageにtokenを保存し、
 *   ダッシュボード側の仕上げ処理（後続コミット等の想定）で後から完了できるようにする
 */
export default function InviteAcceptPanel({ token, alreadyRegistered }: Props) {
  const { isLoaded, isSignedIn } = useUser()
  const [status, setStatus] = useState<Status>('idle')

  useEffect(() => {
    if (!isLoaded || !isSignedIn || alreadyRegistered) return
    setStatus('processing')
    fetch(`/api/referral/invites/${token}/complete`, { method: 'POST', cache: 'no-store' })
      .then(async (res) => {
        if (res.ok) {
          try {
            localStorage.removeItem(PENDING_INVITE_KEY)
          } catch {}
          setStatus('success')
          return
        }
        const data = await res.json().catch(() => ({}))
        if (data.error === 'no_professional_profile') {
          try {
            localStorage.setItem(PENDING_INVITE_KEY, token)
          } catch {}
          setStatus('needs_profile')
        } else if (data.error === 'invite_already_used') {
          setStatus('already_used')
        } else {
          setStatus('error')
        }
      })
      .catch(() => setStatus('error'))
  }, [isLoaded, isSignedIn, alreadyRegistered, token])

  function goToSignUp() {
    try {
      localStorage.setItem(PENDING_INVITE_KEY, token)
    } catch {}
    const returnTo = `/invite/${token}/complete`
    window.location.href = `/sign-up?redirect_url=${encodeURIComponent(returnTo)}`
  }

  if (alreadyRegistered || status === 'success') {
    return (
      <div style={{ marginTop: 16, fontSize: 13, color: T.textSub, lineHeight: 1.7 }}>
        登録が完了しています。
        <a href="/dashboard" style={{ color: T.gold, fontWeight: 600, marginLeft: 6 }}>
          ダッシュボードを開く →
        </a>
      </div>
    )
  }

  if (!isLoaded || status === 'processing') {
    return <div style={{ marginTop: 16, fontSize: 13, color: T.textSub }}>読み込み中...</div>
  }

  if (status === 'needs_profile') {
    return (
      <div style={{ marginTop: 16, fontSize: 13, color: T.textSub, lineHeight: 1.7 }}>
        あと少しです。プロフィールの作成を完了してください。
        <a href="/onboarding" style={{ display: 'block', marginTop: 10 }}>
          <button
            style={{
              width: '100%', padding: '13px 0', borderRadius: 10, border: 'none',
              background: T.dark, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            プロフィールを作成する
          </button>
        </a>
      </div>
    )
  }

  if (status === 'already_used') {
    return (
      <div style={{ marginTop: 16, fontSize: 13, color: T.textSub, lineHeight: 1.7 }}>
        この招待はすでに別の方によって利用されています。
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div style={{ marginTop: 16, fontSize: 13, color: T.textSub, lineHeight: 1.7 }}>
        処理に失敗しました。時間をおいて再度お試しください。
      </div>
    )
  }

  return (
    <button
      onClick={goToSignUp}
      style={{
        marginTop: 16, width: '100%', padding: '13px 0', borderRadius: 10, border: 'none',
        background: T.dark, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
      }}
    >
      無料でプロフィールを作成する
    </button>
  )
}
