'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function Navbar() {
  const supabase = createClient() as any
  const [user, setUser] = useState<any>(null)
  const [isPro, setIsPro] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        const u = authUser || null
        setUser(u)

        if (u) {
          const [{ data: proData }, { data: clientData }] = await Promise.all([
            supabase.from('professionals').select('id').eq('user_id', u.id).maybeSingle(),
            supabase.from('clients').select('id').eq('user_id', u.id).maybeSingle(),
          ])
          setIsPro(!!proData)
          setIsClient(!!clientData)
        }
      } catch (_) {}
      setLoaded(true)
    }
    init()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <nav className="bg-[#1A1A2E] text-white px-6 py-3 flex items-center justify-between">
      <a href="/" className="text-xl font-bold tracking-wider">REAL PROOF</a>
      <div className="flex gap-4 text-sm items-center">
        <a href="/explore" className="hover:text-[#C4A35A] transition">プロを探す</a>
        {loaded && (user ? (
          <>
            {isPro && <a href="/dashboard" className="hover:text-[#C4A35A] transition">ダッシュボード</a>}
            {isClient && <a href="/mycard" className="hover:text-[#C4A35A] transition">マイページ</a>}
            <button onClick={handleLogout} className="hover:text-[#C4A35A] transition">ログアウト</button>
          </>
        ) : (
          <a href="/login" className="hover:text-[#C4A35A] transition">ログイン</a>
        ))}
      </div>
    </nav>
  )
}
