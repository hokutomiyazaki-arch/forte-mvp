'use client'

import { useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'

const T = {
  dark: '#1A1A2E',
  gold: '#C4A35A',
  textSub: '#555555',
}

interface Props {
  proId: string
  proName: string
}

type Status = 'idle' | 'processing' | 'success' | 'needs_profile' | 'self_invite' | 'error'

/**
 * §17-13(CEO指示 2026-08-06): プロ招待QR（/invite/pro/[proId]）の受諾パネル。
 *
 * 既存の InviteAcceptPanel（トークン招待）との違い:
 *   - トークンが無い（1枚のQRを何人にでも見せるため）。使い切りではないので
 *     「既に使用されています」の状態が無い。
 *   - サインアップからの復帰先は**このページ自身**。トークン招待は復帰先を
 *     /invite/[token]/complete に分けているが、こちらは URL に proId が入っていて
 *     何度実行しても冪等なので、専用ページを増やさない。
 */
export default function ProInviteAcceptPanel({ proId, proName }: Props) {
  const { isLoaded, isSignedIn } = useUser()
  const [status, setStatus] = useState<Status>('idle')
  // 二重実行防止（LINE内蔵ブラウザは callback が2回発火する）。API 側も冪等だが、
  // 通知の重複を確実に避けるためクライアントでも1回に絞る。
  const ranRef = useRef(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    if (ranRef.current) return
    ranRef.current = true
    setStatus('processing')
    fetch(`/api/referral/pro-invite/${proId}`, { method: 'POST', cache: 'no-store' })
      .then(async (res) => {
        if (res.ok) {
          setStatus('success')
          return
        }
        const data = await res.json().catch(() => ({}))
        if (data.error === 'no_professional_profile') {
          setStatus('needs_profile')
        } else if (data.error === 'self_invite_not_allowed') {
          setStatus('self_invite')
        } else {
          setStatus('error')
        }
      })
      .catch(() => setStatus('error'))
  }, [isLoaded, isSignedIn, proId])

  function goToSignUp() {
    // 復帰先はこのページ自身。戻ってきた時点で上のeffectが登録処理を走らせる。
    const returnTo = `/invite/pro/${proId}`
    window.location.href = `/sign-up?redirect_url=${encodeURIComponent(returnTo)}`
  }

  if (status === 'success') {
    return (
      <div style={{ marginTop: 16, fontSize: 13, color: T.textSub, lineHeight: 1.7 }}>
        登録が完了しています。{proName}先生とつながりました。
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

  if (status === 'self_invite') {
    return (
      <div style={{ marginTop: 16, fontSize: 13, color: T.textSub, lineHeight: 1.7 }}>
        ご自身のQRコードです。他の先生に読み取ってもらってください。
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
