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
    if (!isLoaded || !signIn || !setActive || !ticket || isSignedIn) return
    let done = false
    const run = async () => {
      try {
        const res = await signIn.create({ strategy: 'ticket', ticket })
        if (res.status === 'complete' && res.createdSessionId) {
          await setActive({ session: res.createdSessionId })
          if (!done) router.push('/auth-redirect') // 既存の role 判定導線に乗せる
        } else {
          setErr('ログインを完了できませんでした')
        }
      } catch (e) {
        setErr('ログインに失敗しました。通常ブラウザでお試しください')
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
