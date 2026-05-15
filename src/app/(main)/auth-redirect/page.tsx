'use client'
import { useUser } from '@clerk/nextjs'
import { useEffect } from 'react'

export default function AuthRedirectPage() {
  const { user, isLoaded } = useUser()

  useEffect(() => {
    if (!isLoaded) return
    if (!user) { window.location.href = '/sign-in'; return }

    fetch('/api/user/role')
      .then(res => res.json())
      .then(data => {
        if (data.role === 'professional') {
          window.location.href = '/dashboard'
        } else if (data.role === 'client') {
          window.location.href = '/'
        } else {
          // DBにレコードなし = 新規ユーザー
          window.location.href = '/onboarding'
        }
      })
      .catch(() => {
        window.location.href = '/onboarding'
      })
  }, [isLoaded, user])

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      height: '100vh', background: '#FAFAF7',
    }}>
      <div className="animate-pulse" style={{ color: '#888' }}>読み込み中...</div>
    </div>
  )
}
