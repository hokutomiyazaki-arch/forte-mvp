'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function Navbar() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user || null)
      setLoading(false)
    }
    check()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <nav className="bg-[#1A1A2E] text-white px-6 py-3 flex items-center justify-between">
      <a href="/" className="text-xl font-bold tracking-wider">FORTE</a>
      <div className="flex gap-4 text-sm items-center">
        <a href="/explore" className="hover:text-[#C4A35A] transition">プロを探す</a>
        {loading ? null : user ? (
          <>
            <a href="/dashboard" className="hover:text-[#C4A35A] transition">ダッシュボード</a>
            <button onClick={handleLogout} className="hover:text-[#C4A35A] transition">ログアウト</button>
          </>
        ) : (
          <a href="/login" className="hover:text-[#C4A35A] transition">ログイン</a>
        )}
      </div>
    </nav>
  )
}
