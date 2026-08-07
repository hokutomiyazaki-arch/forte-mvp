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

    fetch('/api/user/role', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        setIsPro(data.isPro === true)
        // §17-13(2026-08-06): これまで proId は常に null のままだった(返す側に無かった)。
        // /api/user/role が proId を返すようになったのでここで埋める。
        setProId(typeof data.proId === 'string' ? data.proId : null)
      })
      .catch(() => setIsPro(false))
  }, [authLoaded, !!clerkUser]) // eslint-disable-line react-hooks/exhaustive-deps

  return { isPro, proId, isLoading: isPro === null && authLoaded }
}
