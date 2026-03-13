'use client'

import { useState } from 'react'
import { SignInButton, SignedIn, SignedOut, UserButton, useUser } from '@clerk/nextjs'
import { useProStatus } from '@/lib/useProStatus'

export default function Navbar() {
  const { isLoaded } = useUser()
  const { isPro } = useProStatus()
  const [menuOpen, setMenuOpen] = useState(false)

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
        <a href="/for-stores" style={{ color: '#9A9A9A', textDecoration: 'none', fontSize: 13, border: '1px solid #444', padding: '4px 12px', borderRadius: 6, whiteSpace: 'nowrap' as const }}>店舗・団体の方へ</a>
        <a href="/explore" style={{ color: '#fff', textDecoration: 'none' }}>プロを探す</a>
        {!isLoaded ? (
          <div style={{ width: 80 }} />
        ) : (
          <>
            <SignedIn>
              {isPro && (
                <a href="/dashboard" style={{ color: '#fff', textDecoration: 'none' }}>プロメニュー</a>
              )}
              <a href="/mycard" style={{ color: '#fff', textDecoration: 'none' }}>一般メニュー</a>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: 'w-8 h-8',
                    userButtonPopoverActionButton__manageAccount: {
                      display: 'none',
                    },
                  }
                }}
              />
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <button style={{
                  color: '#1A1A2E', background: '#C4A35A', border: 'none',
                  cursor: 'pointer', fontSize: 14, padding: '6px 16px',
                  borderRadius: 8, fontWeight: 600,
                }}>
                  ログイン
                </button>
              </SignInButton>
            </SignedOut>
          </>
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
          <a href="/for-stores" style={{ color: '#9A9A9A', textDecoration: 'none' }}
            onClick={() => setMenuOpen(false)}>店舗・団体の方へ</a>
          <a href="/explore" style={{ color: '#fff', textDecoration: 'none' }}
            onClick={() => setMenuOpen(false)}>プロを探す</a>
          <SignedIn>
            {isPro && (
              <a href="/dashboard" style={{ color: '#fff', textDecoration: 'none' }}
                onClick={() => setMenuOpen(false)}>プロメニュー</a>
            )}
            <a href="/mycard" style={{ color: '#fff', textDecoration: 'none' }}
              onClick={() => setMenuOpen(false)}>一般メニュー</a>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: 'w-8 h-8',
                }
              }}
            />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button onClick={() => setMenuOpen(false)}
                style={{ color: '#fff', background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: 15, textAlign: 'left' as const, padding: 0 }}>
                ログイン
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      )}
    </nav>
  )
}
