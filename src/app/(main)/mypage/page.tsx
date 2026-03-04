'use client'

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'

export default function MyPage() {
  const { isLoaded, isSignedIn } = useAuth()

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      window.location.href = '/sign-in'
      return
    }

    // hookに頼らず直接APIを叩く
    fetch('/api/user/role')
      .then(res => res.json())
      .then(data => {
        if (data.isPro) {
          window.location.href = '/dashboard'
        } else {
          window.location.href = '/mycard'
        }
      })
      .catch(() => {
        window.location.href = '/mycard'
      })
  }, [isLoaded, isSignedIn])

  return (
    <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
      <div className="text-[#1A1A2E] text-sm">読み込み中...</div>
    </div>
  )
}
