'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function Navbar() {
  const supabase = createClient() as any
  const [user, setUser] = useState<any>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setUser(session?.user || null)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <nav className="bg-[#1A1A2E] text-white px-6 py-3 flex items-center justify-between">
      <a href="/" className="text-xl font-bold tracking-wider">PROOF</a>
      <div className="flex gap-4 text-sm items-center">
        <a href="/explore" className="hover:text-[#C4A35A] transition">プロを探す</a>
        {loaded && (user ? (
          <>
            <a href="/dashboard" className="hover:text-[#C4A35A] transition">ダッシュボード</a>
            <a href="/mycard" className="hover:text-[#C4A35A] transition">マイカード</a>
            <button onClick={handleLogout} className="hover:text-[#C4A35A] transition">ログアウト</button>
          </>
        ) : (
          <a href="/login" className="hover:text-[#C4A35A] transition">ログイン</a>
        ))}
      </div>
    </nav>
  )
}
