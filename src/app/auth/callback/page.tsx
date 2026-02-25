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

    // 古いセッションをクリア（新しいOAuthセッションと競合しないように）
    clearAllAuthStorage()

    // デバッグ: URL状態を表示
    setDebugInfo(
      `callback: hash=${window.location.hash.substring(0, 50)} | ` +
      `search=${window.location.search.substring(0, 50)}`
    )

    // 10秒絶対タイムアウト: これ以上待たずにログインページにリダイレクト
    const absoluteTimeout = setTimeout(() => {
      console.log('[auth/callback] absolute timeout (10s) → redirect to login')
      setDebugInfo('callback: absolute timeout → /login')
      window.location.href = '/login?error=timeout'
    }, 10000)

    // Supabase client library automatically picks up the tokens from the URL hash
    // We just need to wait for the session to be established
    supabase.auth.onAuthStateChange((event: string, session: any) => {
      console.log('[auth/callback] onAuthStateChange:', event, !!session)
      setDebugInfo(`callback: event=${event} session=${session ? 'YES' : 'NO'}`)
      if (event === 'SIGNED_IN' && session) {
        clearTimeout(absoluteTimeout)
        // Get role/nickname from URL search params
        const params = new URLSearchParams(window.location.search)
        const role = params.get('role') || 'pro'
        const nickname = params.get('nickname') || ''

        const redirectParams = new URLSearchParams()
        redirectParams.set('role', role)
        if (nickname) redirectParams.set('nickname', nickname)

        setDebugInfo(`callback: SIGNED_IN → redirecting to /login?${redirectParams.toString()}`)
        window.location.href = '/login?' + redirectParams.toString()
      }
    })

    // Also check if session already exists (with timeout)
    setTimeout(async () => {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 3000)
        )
        const sessionPromise = supabase.auth.getSession()
        const { data } = await Promise.race([sessionPromise, timeoutPromise]) as any
        const session = data?.session

        console.log('[auth/callback] getSession check:', session ? 'EXISTS' : 'NULL')
        setDebugInfo(`callback: getSession=${session ? 'YES' : 'NO'}`)

        if (session) {
          clearTimeout(absoluteTimeout)
          const params = new URLSearchParams(window.location.search)
          const role = params.get('role') || 'pro'
          const nickname = params.get('nickname') || ''

          const redirectParams = new URLSearchParams()
          redirectParams.set('role', role)
          if (nickname) redirectParams.set('nickname', nickname)

          setDebugInfo(`callback: session found → redirecting to /login?${redirectParams.toString()}`)
          window.location.href = '/login?' + redirectParams.toString()
        }
      } catch (e) {
        console.log('[auth/callback] getSession timeout - waiting for onAuthStateChange')
        setDebugInfo(`callback: getSession timeout, waiting for onAuthStateChange...`)
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
