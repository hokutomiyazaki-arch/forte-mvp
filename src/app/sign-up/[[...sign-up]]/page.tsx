'use client'
import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'

export default function SignUpPage() {
  const { isSignedIn, isLoaded } = useAuth()

  useEffect(() => {
    if (!isLoaded) return
    if (isSignedIn) {
      window.location.href = '/auth-redirect'
      return
    }
    window.location.href = `https://accounts.realproof.jp/sign-up?redirect_url=${encodeURIComponent('https://realproof.jp/auth-redirect')}`
  }, [isLoaded, isSignedIn])

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      height: '100vh', background: '#FAFAF7',
    }}>
      <div className="animate-pulse" style={{ color: '#888' }}>登録ページに移動中...</div>
    </div>
  )
}
