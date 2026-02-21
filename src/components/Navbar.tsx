'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
export default function Navbar() {
  const supabase = createClient() as any
  const [user, setUser] = useState<any>(null)
  const [isPro, setIsPro] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string>('loading...')

  useEffect(() => {
    let cancelled = false

    async function checkSession() {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 3000)
        )
        const sessionPromise = supabase.auth.getSession()

        const { data } = await Promise.race([sessionPromise, timeoutPromise]) as any

        if (cancelled) return

        const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-'))
        setDebugInfo(
          `session: ${data?.session ? 'YES (' + data.session.user.email + ')' : 'NO'} | ` +
          `sb-keys: ${sbKeys.length} | ` +
          `expires: ${data?.session?.expires_at ? new Date(data.session.expires_at * 1000).toLocaleTimeString() : 'N/A'}`
        )

        const u = data?.session?.user || null
        setUser(u)

        if (u) {
          const [{ data: proData }, { data: clientData }] = await Promise.all([
            supabase.from('professionals').select('id').eq('user_id', u.id).maybeSingle(),
            supabase.from('clients').select('id').eq('user_id', u.id).maybeSingle(),
          ])
          if (!cancelled) {
            setIsPro(!!proData)
            setIsClient(!!clientData)
          }
        }
      } catch (e) {
        if (!cancelled) {
          setUser(null)
          setDebugInfo(`error: ${e instanceof Error ? e.message : 'unknown'}`)
        }
      }
      if (!cancelled) setLoaded(true)
    }

    checkSession()
    return () => { cancelled = true }
  }, [])

  async function handleLogout() {
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch (e) {
      console.error('signOut error:', e)
    }
    // ブラウザストレージを完全クリア
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') || key.includes('supabase')) localStorage.removeItem(key)
      })
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('sb-') || key.includes('supabase')) sessionStorage.removeItem(key)
      })
    } catch (e) {
      console.error('storage clear error:', e)
    }
    window.location.href = '/'
  }

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .nav-links { gap: 12px !important; }
          .nav-links a, .nav-links button { font-size: 11px !important; }
        }
      `}</style>
    <nav className="bg-[#1A1A2E] text-white px-6 py-3 flex items-center justify-between">
      <a href="/" style={{ textDecoration: 'none' }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 800, color: '#FAFAF7', letterSpacing: '2px' }}>REALPROOF</span>
      </a>
      <div className="nav-links flex gap-4 text-sm items-center">
        <a href="/explore" className="hover:text-[#C4A35A] transition">プロを探す</a>
        {loaded && (user ? (
          <>
            {isPro && <a href="/dashboard" className="hover:text-[#C4A35A] transition">ダッシュボード</a>}
            <a href="/mycard" className="hover:text-[#C4A35A] transition">リワード</a>
            <button onClick={handleLogout} className="hover:text-[#C4A35A] transition">ログアウト</button>
          </>
        ) : (
          <a href="/login" className="hover:text-[#C4A35A] transition">ログイン</a>
        ))}
      </div>
    </nav>
    {/* DEBUG: 一時的なデバッグ表示 — 原因特定後に削除 */}
    <div className="fixed bottom-0 left-0 right-0 bg-red-600 text-white text-xs p-1 z-[9999] text-center">
      {debugInfo}
    </div>
    </>
  )
}
