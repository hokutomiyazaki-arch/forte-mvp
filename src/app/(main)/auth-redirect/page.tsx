'use client'
import { useUser } from '@clerk/nextjs'
import { useEffect } from 'react'

export default function AuthRedirect() {
  const { user, isLoaded } = useUser()

  useEffect(() => {
    if (!isLoaded) return
    if (!user) {
      window.location.href = '/sign-in'
      return
    }

    fetch('/api/user/role')
      .then(res => res.json())
      .then(data => {
        console.log('[auth-redirect] roleData:', JSON.stringify(data))
        if (data.role === 'professional' && !data.proDeactivated) {
          window.location.href = '/dashboard'
        } else if (data.role === null) {
          window.location.href = '/onboarding'
        } else {
          window.location.href = '/mycard'
        }
      })
      .catch(() => {
        window.location.href = '/mycard'
      })
  }, [isLoaded, user])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAF7]">
      <div className="animate-pulse text-gray-400">読み込み中...</div>
    </div>
  )
}
