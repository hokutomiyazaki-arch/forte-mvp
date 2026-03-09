'use client'
import { useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'
import { useAuth } from '@clerk/nextjs'

const ACCOUNTS_BASE = 'https://accounts.realproof.jp'
const APP_BASE = 'https://realproof.jp'

function SignInRedirect() {
  const searchParams = useSearchParams()
  const { isSignedIn, isLoaded } = useAuth()

  useEffect(() => {
    if (!isLoaded) return

    const redirect = searchParams.get('redirect') || searchParams.get('redirect_url')

    if (isSignedIn) {
      window.location.href = redirect || '/auth-redirect'
      return
    }

    const afterSignIn = redirect
      ? `${APP_BASE}${redirect.startsWith('/') ? redirect : '/' + redirect}`
      : `${APP_BASE}/auth-redirect`

    window.location.href = `${ACCOUNTS_BASE}/sign-in?redirect_url=${encodeURIComponent(afterSignIn)}`
  }, [isLoaded, isSignedIn, searchParams])

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      height: '100vh', background: '#FAFAF7',
    }}>
      <div className="animate-pulse" style={{ color: '#888' }}>ログインページに移動中...</div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#FAFAF7' }}>
        <div style={{ color: '#888' }}>読み込み中...</div>
      </div>
    }>
      <SignInRedirect />
    </Suspense>
  )
}
