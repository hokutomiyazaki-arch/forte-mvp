'use client'

import { useEffect } from 'react'
import { useProStatus } from '@/lib/useProStatus'

export default function MyPage() {
  const { isPro, isLoading } = useProStatus()

  useEffect(() => {
    if (isLoading) return // ロード完了まで待つ
    if (isPro) {
      window.location.href = '/dashboard'
    } else {
      window.location.href = '/mycard'
    }
  }, [isPro, isLoading])

  return (
    <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
      <div className="text-[#1A1A2E] text-sm">読み込み中...</div>
    </div>
  )
}
