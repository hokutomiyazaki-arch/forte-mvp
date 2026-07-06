'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSignIn, useUser } from '@clerk/nextjs'
import { useRouter, useSearchParams } from 'next/navigation'

// 値全体は出さず prefix のみ（dev=pk_test_ / prod=pk_live_ 判定用）
const PK_PREFIX = (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '').slice(0, 8) || '(none)'

function LineCompleteInner() {
  const { signIn, setActive, isLoaded } = useSignIn()
  const { isSignedIn } = useUser()
  const router = useRouter()
  const ticket = useSearchParams().get('ticket')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    // ① バグ修正: 既にサインイン済みなら return せず role 判定導線へ
    if (isSignedIn) {
      router.push('/auth-redirect')
      return
    }
    // ① バグ修正: ticket が無ければ silent 停止させずエラー表示
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
      <div style={{ marginBottom: 16 }}>{err ? err : 'ログイン処理中…'}</div>
      {/* 🔬 一時デバッグ表示（切り分け用・確定後に削除予定） */}
      <div
        style={{
          margin: '0 auto',
          maxWidth: 320,
          padding: 12,
          textAlign: 'left',
          fontSize: 12,
          fontFamily: 'monospace',
          background: '#F3F3F0',
          border: '1px solid #E8E4DC',
          borderRadius: 8,
          color: '#1A1A2E',
          wordBreak: 'break-all',
        }}
      >
        <div>isLoaded: {String(isLoaded)}</div>
        <div>ticket: {ticket ? '有' : '無'}</div>
        <div>isSignedIn: {String(isSignedIn)}</div>
        <div>err: {err || '(none)'}</div>
        <div>pk: {PK_PREFIX}</div>
      </div>
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
