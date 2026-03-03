'use client'

import { useState, useEffect, useRef } from 'react'
import { useUser } from '@clerk/nextjs'

/**
 * カスタムhook: ログインユーザーがプロかどうかを判定
 * /api/user/role を使って判定し、結果をキャッシュする。
 * ログアウト時は自動的にリセットされる。
 */
export function useProStatus() {
  const { user: clerkUser, isLoaded: authLoaded } = useUser()
  const [isPro, setIsPro] = useState<boolean | null>(null) // null = 判定中
  const [proId, setProId] = useState<string | null>(null)
  const checkedRef = useRef(false)

  useEffect(() => {
    if (!authLoaded) return

    // ログアウト状態: リセット
    if (!clerkUser) {
      checkedRef.current = false
      setIsPro(false)
      setProId(null)
      return
    }

    // 既にチェック済みなら再実行しない
    if (checkedRef.current) return
    checkedRef.current = true

    fetch('/api/user/role')
      .then(res => res.json())
      .then(data => {
        setIsPro(data.isPro === true)
      })
      .catch(() => setIsPro(false))
  }, [authLoaded, !!clerkUser]) // eslint-disable-line react-hooks/exhaustive-deps

  return { isPro, proId, isLoading: isPro === null && authLoaded }
}
