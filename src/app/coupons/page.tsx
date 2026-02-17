'use client'
import { useEffect } from 'react'

export default function CouponsRedirect() {
  useEffect(() => {
    window.location.href = '/mycard'
  }, [])

  return <div className="text-center py-16 text-gray-400">リダイレクト中...</div>
}
