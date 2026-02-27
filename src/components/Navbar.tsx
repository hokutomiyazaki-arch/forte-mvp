'use client'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export default function Navbar() {
  const { user, isPro, isLoaded, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const myPageHref = isPro ? '/dashboard' : '/mycard'

  return (
    <nav style={{
      background: '#1A1A2E', color: '#fff',
      padding: '0 24px', height: 56,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      position: 'relative',
    }}>
      {/* ロゴ */}
      <a href="/" style={{ textDecoration: 'none' }}>
        <span style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 16, fontWeight: 800,
          color: '#FAFAF7', letterSpacing: '2px',
        }}>REALPROOF</span>
      </a>

      {/* Desktop メニュー（640px以上） */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 14 }}
           className="hidden-mobile">
        <a href="/explore" style={{ color: '#fff', textDecoration: 'none' }}>プロを探す</a>
        {!isLoaded ? (
          <div style={{ width: 80 }} />
        ) : user ? (
          <>
            <a href={myPageHref} style={{ color: '#fff', textDecoration: 'none' }}>マイページ</a>
            <button onClick={() => signOut('/')}
              style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
              ログアウト
            </button>
          </>
        ) : (
          <a href="/login" style={{ color: '#fff', textDecoration: 'none' }}>ログイン</a>
        )}
      </div>

      {/* Mobile ハンバーガー（639px以下） */}
      <button onClick={() => setMenuOpen(!menuOpen)}
        className="show-mobile-only"
        style={{
          color: '#fff', background: 'none', border: 'none',
          fontSize: 22, cursor: 'pointer', padding: 4,
        }}>
        {menuOpen ? '✕' : '☰'}
      </button>

      {/* Mobile スライドメニュー */}
      {menuOpen && (
        <div style={{
          position: 'absolute', top: 56, right: 0,
          background: '#1A1A2E', width: 200,
          padding: '16px 24px',
          borderRadius: '0 0 0 12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          zIndex: 100,
          display: 'flex', flexDirection: 'column' as const, gap: 16,
          fontSize: 15,
        }}>
          <a href="/explore" style={{ color: '#fff', textDecoration: 'none' }}
            onClick={() => setMenuOpen(false)}>プロを探す</a>
          {user ? (
            <>
              <a href={myPageHref} style={{ color: '#fff', textDecoration: 'none' }}
                onClick={() => setMenuOpen(false)}>マイページ</a>
              <button onClick={() => { signOut('/'); setMenuOpen(false) }}
                style={{ color: '#fff', background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: 15, textAlign: 'left' as const, padding: 0 }}>
                ログアウト
              </button>
            </>
          ) : (
            <a href="/login" style={{ color: '#fff', textDecoration: 'none' }}
              onClick={() => setMenuOpen(false)}>ログイン</a>
          )}
        </div>
      )}
    </nav>
  )
}
