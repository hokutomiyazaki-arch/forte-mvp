'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSignIn, useUser } from '@clerk/nextjs'
import { useRouter, useSearchParams } from 'next/navigation'

function LineCompleteInner() {
  const { signIn, setActive, isLoaded } = useSignIn()
  const { isSignedIn } = useUser()
  const router = useRouter()
  const ticket = useSearchParams().get('ticket')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    // iOS PWA では ClerkJS が初期化できず isLoaded が false のまま固まる。
    // 5秒待っても読み込めなければ、文言を出さず黙って sign-in へ戻す。
    // （PWA で確実に遷移させるため router.push ではなく window.location.href）
    if (!isLoaded) {
      const timer = setTimeout(() => {
        window.location.href = '/sign-in'
      }, 5000)
      return () => clearTimeout(timer)
    }
    // 既にサインイン済みなら role 判定導線へ
    if (isSignedIn) {
      router.push('/auth-redirect')
      return
    }
    // ticket が無ければ silent 停止させずエラー表示
    if (!ticket) {
      setErr('ログイン情報(ticket)が見つかりませんでした。もう一度お試しください')
      return
    }
    if (!signIn || !setActive) return
    let done = false
    const run = async () => {
      try {
        const res = await signIn.create({ strategy: 'ticket', ticket })
        if (res.status === 'complete' && res.createdSessionId) {
          await setActive({ session: res.createdSessionId })
          if (!done) router.push('/auth-redirect') // 既存の role 判定導線に乗せる
        } else {
          setErr(`ログインを完了できませんでした (status: ${res.status})`)
        }
      } catch (e: any) {
        const detail = e?.errors?.[0]?.message || e?.message || String(e)
        setErr(`ログインに失敗しました: ${detail}`)
      }
    }
    run()
    return () => {
      done = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, ticket, isSignedIn]) // ← プリミティブのみ

  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      {err ? err : 'ログイン処理中…'}
    </div>
  )
}

export default function LineCompletePage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, textAlign: 'center' }}>ログイン処理中…</div>}
    >
      <LineCompleteInner />
    </Suspense>
  )
}
