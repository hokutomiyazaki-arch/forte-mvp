'use client'
import { useAuth } from '@/contexts/AuthContext'

export default function Navbar() {
  const { user, isPro, isLoaded, signOut } = useAuth()

  return (
    <nav className="bg-[#1A1A2E] text-white px-6 py-3 flex items-center justify-between">
      <a href="/" style={{ textDecoration: 'none' }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 800, color: '#FAFAF7', letterSpacing: '2px' }}>REALPROOF</span>
      </a>
      <div className="nav-links flex gap-4 text-sm items-center">
        <a href="/explore" className="hover:text-[#C4A35A] transition">プロを探す</a>
        {!isLoaded ? (
          <div style={{ width: '80px' }} />
        ) : user ? (
          <>
            {isPro && <a href="/dashboard" className="hover:text-[#C4A35A] transition">ダッシュボード</a>}
            <a href="/mycard" className="hover:text-[#C4A35A] transition">リワード</a>
            <button onClick={() => signOut('/')} className="hover:text-[#C4A35A] transition">ログアウト</button>
          </>
        ) : (
          <a href="/login" className="hover:text-[#C4A35A] transition">ログイン</a>
        )}
      </div>
    </nav>
  )
}
