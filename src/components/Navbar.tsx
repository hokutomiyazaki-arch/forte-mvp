'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function Navbar() {
  const supabase = createClient() as any
  const [user, setUser] = useState<any>(null)
  const [isPro, setIsPro] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      const u = session?.user || null
      setUser(u)

      if (u) {
        const { data: proData } = await supabase
          .from('professionals').select('id').eq('user_id', u.id).single()
        setIsPro(!!proData)

        const { data: clientData } = await supabase
          .from('clients').select('id').eq('user_id', u.id).single()
        setIsClient(!!clientData)
      }

      setLoading(false)
    }
    check()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user || null
      setUser(u)
      if (u) {
        const { data: proData } = await supabase
          .from('professionals').select('id').eq('user_id', u.id).single()
        setIsPro(!!proData)
        const { data: clientData } = await supabase
          .from('clients').select('id').eq('user_id', u.id).single()
        setIsClient(!!clientData)
      } else {
        setIsPro(false)
        setIsClient(false)
      }
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
            {isPro && (
              <a href="/dashboard" className="hover:text-[#C4A35A] transition">プロ管理</a>
            )}
            {isClient && (
              <a href="/mycard" className="hover:text-[#C4A35A] transition">マイカード</a>
            )}
            {!isPro && !isClient && (
              <a href="/dashboard" className="hover:text-[#C4A35A] transition">ダッシュボード</a>
            )}
            <button onClick={handleLogout} className="hover:text-[#C4A35A] transition">ログアウト</button>
          </>
        ) : (
          <a href="/login" className="hover:text-[#C4A35A] transition">ログイン</a>
        )}
      </div>
    </nav>
  )
}
