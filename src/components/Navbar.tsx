'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getSessionSafe, signOutAndClear } from '@/lib/auth-helper'

export default function Navbar() {
  const supabase = createClient() as any
  const [user, setUser] = useState<any>(null)
  const [isPro, setIsPro] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string>('loading...')
  const [showDebug, setShowDebug] = useState(false)

  useEffect(() => {
    setShowDebug(new URLSearchParams(window.location.search).has('debug'))
  }, [])

  useEffect(() => {
    let cancelled = false

    async function checkSession() {
      // sb-keysが0ならセッション確認不要 → 即「未ログイン」
      const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-'))
      if (sbKeys.length === 0) {
        if (!cancelled) {
          setUser(null)
          setDebugInfo('no sb-keys → no session')
          setLoaded(true)
        }
        return
      }

      try {
        // getSessionSafe で統一（モバイルでのハング防止）
        const { session, user: sessionUser, source } = await getSessionSafe()

        if (cancelled) return

        if (sessionUser) {
          setUser(sessionUser)
          setDebugInfo(
            `session: YES (${sessionUser.email}) | source: ${source} | sb-keys: ${sbKeys.length}`
          )

          // セッションをクライアントにセット（localStorageから読んだ場合）
          if (source === 'localStorage' && session?.access_token && session?.refresh_token) {
            try {
              await supabase.auth.setSession({
                access_token: session.access_token,
                refresh_token: session.refresh_token,
              })
            } catch (_) {}
          }

          // プロ/クライアント判定
          try {
            const [{ data: proData }, { data: clientData }] = await Promise.all([
              supabase.from('professionals').select('id').eq('user_id', sessionUser.id).maybeSingle(),
              supabase.from('clients').select('id').eq('user_id', sessionUser.id).maybeSingle(),
            ])
            if (!cancelled) {
              setIsPro(!!proData)
              setIsClient(!!clientData)
            }
          } catch (_) {
            // DB問い合わせ失敗時はプロ判定せず
            if (!cancelled) {
              setIsPro(false)
              setIsClient(true)
            }
          }
        } else {
          setUser(null)
          setDebugInfo(`no session | sb-keys: ${sbKeys.length}`)
        }
      } catch (e) {
        if (!cancelled) {
          setUser(null)
          setDebugInfo(`error: ${e instanceof Error ? e.message : 'unknown'} | sb-keys: ${sbKeys.length}`)
        }
      }
      if (!cancelled) setLoaded(true)
    }

    checkSession()
    return () => { cancelled = true }
  }, [])

  return (
    <>
    <nav className="bg-[#1A1A2E] text-white px-6 py-3 flex items-center justify-between">
      <a href="/" style={{ textDecoration: 'none' }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 800, color: '#FAFAF7', letterSpacing: '2px' }}>REALPROOF</span>
      </a>
      <div className="nav-links flex gap-4 text-sm items-center">
        <a href="/explore" className="hover:text-[#C4A35A] transition">プロを探す</a>
        {!loaded ? (
          <div style={{ width: '80px' }} />
        ) : user ? (
          <>
            {isPro && <a href="/dashboard" className="hover:text-[#C4A35A] transition">ダッシュボード</a>}
            <a href="/mycard" className="hover:text-[#C4A35A] transition">リワード</a>
            <button onClick={() => signOutAndClear('/')} className="hover:text-[#C4A35A] transition">ログアウト</button>
          </>
        ) : (
          <a href="/login" className="hover:text-[#C4A35A] transition">ログイン</a>
        )}
      </div>
    </nav>
    {/* DEBUG: ?debug=1 の時のみ表示 */}
    {showDebug && (
      <div className="fixed bottom-0 left-0 right-0 bg-red-600 text-white text-xs p-1 z-[9999] text-center">
        {debugInfo}
      </div>
    )}
    </>
  )
}
