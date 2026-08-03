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
    // §2-9(第3弾): alreadyRegisteredでもログイン済みなら complete API に判定させる。
    // APIは冪等で、登録済み本人には success(already:true)・他人には 409 invite_already_used を
    // 返すため、本人の開き直しに「使用済み」と誤表示しない。
    if (!isLoaded || !isSignedIn) return
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
          // R7レビュー指摘: 使用済み招待(alreadyRegistered)をプロフィール未作成の第三者が
          // 開いた場合、オンボーディングへ誤誘導せず「使用済み」を出す。死にトークンを
          // localStorageに保存しない(正規の招待相手は登録完了までregistered_pro_idが
          // 入らない=alreadyRegistered:falseなので、needs_profile経路は従来通り動く)。
          if (alreadyRegistered) {
            setStatus('already_used')
            return
          }
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

  if (status === 'success') {
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

  // §2-9(第3弾): 招待URLは1人分(single-use)。使用済みURLを開いた未ログインの人には
  // 「既に使用されています」を出し、サインアップ導線を出さない。ログイン済みの場合は
  // 上のeffect→APIの冪等判定に任せる(登録済み本人=success表示・他人=already_used表示)ため、
  // ここはstatusがidleに留まる未ログイン時のみ通る。
  if (alreadyRegistered && status === 'idle') {
    return (
      <div style={{ marginTop: 16, fontSize: 13, color: T.textSub, lineHeight: 1.7 }}>
        この招待は既に使用されています。招待した先生に新しい招待URLの発行を依頼してください。
      </div>
    )
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
