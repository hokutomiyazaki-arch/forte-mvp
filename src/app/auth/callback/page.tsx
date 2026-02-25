'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { clearAllAuthStorage } from '@/lib/auth-helper'

export default function AuthCallback() {
  const [debugInfo, setDebugInfo] = useState('callback: loading...')
  const [showDebug, setShowDebug] = useState(false)

  useEffect(() => {
    setShowDebug(new URLSearchParams(window.location.search).has('debug'))
    const supabase = createClient() as any
    let redirecting = false

    // 古いセッションをクリア（新しいOAuthセッションと競合しないように）
    clearAllAuthStorage()

    // デバッグ: URL状態を表示
    setDebugInfo(
      `callback: hash=${window.location.hash.substring(0, 50)} | ` +
      `search=${window.location.search.substring(0, 50)}`
    )

    // 15秒絶対タイムアウト
    const absoluteTimeout = setTimeout(() => {
      if (redirecting) return
      console.log('[auth/callback] absolute timeout (15s) → redirect to login')
      setDebugInfo('callback: absolute timeout → /login')
      window.location.href = '/login?error=timeout'
    }, 15000)

    // リダイレクト先URLを構築するヘルパー
    function buildRedirectUrl() {
      const params = new URLSearchParams(window.location.search)
      const role = params.get('role') || 'pro'
      const nickname = params.get('nickname') || ''
      const redirectParams = new URLSearchParams()
      redirectParams.set('role', role)
      if (nickname) redirectParams.set('nickname', nickname)
      return '/login?' + redirectParams.toString()
    }

    // セッション確定 → localStorage永続化 → リダイレクト
    async function handleSessionConfirmed(session: any) {
      if (redirecting) return
      redirecting = true
      clearTimeout(absoluteTimeout)

      console.log('[auth/callback] session confirmed, persisting to localStorage...')
      setDebugInfo('callback: session confirmed, persisting...')

      // 1. setSession で localStorage に確実に書き込む
      try {
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        })
        console.log('[auth/callback] setSession completed')
      } catch (e) {
        console.warn('[auth/callback] setSession failed, trying manual write:', e)
        // フォールバック: 手動でlocalStorageに書き込む
        try {
          const storageKey = Object.keys(localStorage).find(
            (k: string) => k.startsWith('sb-') && k.endsWith('-auth-token')
          ) || 'sb-' + (window.location.hostname.split('.')[0] || 'app') + '-auth-token'

          const payload = JSON.parse(atob(session.access_token.split('.')[1]))
          const sessionData = {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at || Math.floor(Date.now() / 1000) + 3600,
            expires_in: session.expires_in || 3600,
            token_type: 'bearer',
            user: {
              id: payload.sub,
              email: payload.email,
              app_metadata: payload.app_metadata || {},
              user_metadata: payload.user_metadata || {},
              aud: payload.aud,
              role: payload.role,
            }
          }
          localStorage.setItem(storageKey, JSON.stringify(sessionData))
          console.log('[auth/callback] manual localStorage write done, key:', storageKey)
        } catch (e2) {
          console.warn('[auth/callback] manual write also failed:', e2)
        }
      }

      // 2. localStorage に書き込まれたか確認（最大2秒ポーリング）
      let confirmed = false
      for (let i = 0; i < 20; i++) {
        const sbKeys = Object.keys(localStorage).filter(
          (k: string) => k.startsWith('sb-') && k.includes('auth-token')
        )
        if (sbKeys.length > 0) {
          const stored = localStorage.getItem(sbKeys[0])
          if (stored && stored.includes('access_token')) {
            confirmed = true
            break
          }
        }
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      console.log('[auth/callback] localStorage confirmed:', confirmed)
      setDebugInfo(`callback: persisted=${confirmed} → redirecting...`)

      // 3. リダイレクト
      const url = buildRedirectUrl()
      console.log('[auth/callback] redirecting to:', url)
      window.location.href = url
    }

    // onAuthStateChange でセッション検知
    supabase.auth.onAuthStateChange((event: string, session: any) => {
      console.log('[auth/callback] onAuthStateChange:', event, !!session)
      setDebugInfo(`callback: event=${event} session=${session ? 'YES' : 'NO'}`)
      if (event === 'SIGNED_IN' && session) {
        handleSessionConfirmed(session)
      }
    })

    // getSession フォールバック（1秒後）
    setTimeout(async () => {
      if (redirecting) return
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5000)
        )
        const sessionPromise = supabase.auth.getSession()
        const { data } = await Promise.race([sessionPromise, timeoutPromise]) as any
        const session = data?.session

        console.log('[auth/callback] getSession check:', session ? 'EXISTS' : 'NULL')
        setDebugInfo(`callback: getSession=${session ? 'YES' : 'NO'}`)

        if (session) {
          handleSessionConfirmed(session)
        }
      } catch (e) {
        console.log('[auth/callback] getSession timeout - waiting for onAuthStateChange')
        setDebugInfo('callback: getSession timeout, waiting...')
      }
    }, 1000)

    return () => clearTimeout(absoluteTimeout)
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAF7] px-6">
      <div className="max-w-sm w-full text-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#C4A35A] border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-500 text-sm">認証中...</p>
      </div>
      {/* DEBUG: ?debug=1 の時のみ表示 */}
      {showDebug && (
        <div className="fixed bottom-6 left-0 right-0 bg-blue-600 text-white text-xs p-1 z-[9999] text-center">
          {debugInfo}
        </div>
      )}
    </div>
  )
}
