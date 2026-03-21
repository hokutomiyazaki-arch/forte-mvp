'use client'

import { useState, useEffect } from 'react'
import { SignInButton, SignedIn, SignedOut, UserButton, useUser } from '@clerk/nextjs'
import { useProStatus } from '@/lib/useProStatus'

function NotificationBell({ count }: { count: number }) {
  return (
    <a href="/announcements" style={{ position: 'relative', color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
      <span style={{ fontSize: 16 }}>🔔</span>
      {count > 0 && (
        <span style={{
          position: 'absolute', top: -6, right: -8,
          background: '#E24B4A', color: '#fff',
          fontSize: 9, fontWeight: 700,
          width: 16, height: 16, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {count > 9 ? '9+' : count}
        </span>
      )}
    </a>
  )
}

export default function Navbar() {
  const { isLoaded } = useUser()
  const { isPro } = useProStatus()
  const [menuOpen, setMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    fetch('/api/announcements')
      .then(res => res.json())
      .then(data => {
        if (data.unread_count) setUnreadCount(data.unread_count)
      })
      .catch(() => {})
  }, [])

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
              <NotificationBell count={unreadCount} />
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
            <a href="/announcements" style={{ color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setMenuOpen(false)}>
              🔔 お知らせ
              {unreadCount > 0 && (
                <span style={{
                  background: '#E24B4A', color: '#fff',
                  fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', borderRadius: 10,
                }}>
                  {unreadCount}
                </span>
              )}
            </a>
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
          <div style={{ borderTop: '1px solid #333', paddingTop: 12, marginTop: 4 }}>
            <a href="/bug-report" style={{ color: '#888', textDecoration: 'none', fontSize: 13 }}
              onClick={() => setMenuOpen(false)}>不具合・エラーのご報告</a>
          </div>
        </div>
      )}
    </nav>
  )
}
