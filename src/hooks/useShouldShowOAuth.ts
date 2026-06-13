'use client'

import { useEffect, useState } from 'react'
import { shouldShowOAuth } from '@/lib/oauth-browser-allow'

/**
 * OAuth（Google/LINE）を表示してよいかをクライアントで判定するフック。
 *
 * - 初期 state は false（= 最初はコード認証のみ表示）。
 *   判定前 / SSR / 非標準ブラウザでは絶対に OAuth を出さない（安全側）。
 * - マウント時に1回だけ shouldShowOAuth() を実行し、標準ブラウザ確定時のみ true に更新。
 * - useEffect の依存配列は空 [] = マウント時1回のみ（CLAUDE.md ルール準拠）。
 */
export function useShouldShowOAuth(): boolean {
  const [showOAuth, setShowOAuth] = useState(false)

  useEffect(() => {
    setShowOAuth(shouldShowOAuth())
  }, [])

  return showOAuth
}
