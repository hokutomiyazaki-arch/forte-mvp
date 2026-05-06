'use client'

import { useState } from 'react'
import { SignInButton, SignedIn, SignedOut, UserButton, useUser, useClerk } from '@clerk/nextjs'
import { useProStatus } from '@/lib/useProStatus'
import { useSharedData } from '@/contexts/SharedDataContext'

const menuLinkStyle: React.CSSProperties = {
  display: 'block',
  padding: '10px 16px',
  fontSize: 14,
  color: '#FAFAF7',
  textDecoration: 'none',
  cursor: 'pointer',
}
const menuGroupLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#9CA3AF',
  letterSpacing: 1,
  padding: '16px 16px 4px',
  borderTop: '1px solid #333',
  marginTop: 8,
}
const menuDivider: React.CSSProperties = {
  borderTop: '1px solid #333',
  marginTop: 8,
  paddingTop: 8,
}

const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
    style={{
      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
      transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      flexShrink: 0,
    }}
  >
    <path d="M6 3L11 8L6 13" stroke="#C4A35A" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export default function Navbar() {
  const { isLoaded, isSignedIn } = useUser()
  const { isPro } = useProStatus()
  const { signOut } = useClerk()
  const [menuOpen, setMenuOpen] = useState(false)
  const [openMenuGroups, setOpenMenuGroups] = useState<Record<string, boolean>>({
    settings: false,
    discover: false,
    support: false,
  })
  const { unreadCount, ownedOrg, hasOrgMembership, eligibleCertificationTier } = useSharedData()

  const toggleMenuGroup = (group: string) => {
    setOpenMenuGroups(prev => ({ ...prev, [group]: !prev[group] }))
  }

  const closeMenu = () => {
    setMenuOpen(false)
    setOpenMenuGroups({ settings: false, discover: false, support: false })
  }

  function renderMenuItems() {
    return (
      <>
        {/* トップレベルリンク */}
        <SignedIn>
          {ownedOrg && (
            <a href="/org/dashboard" onClick={closeMenu} style={menuLinkStyle}>団体管理</a>
          )}
          {isPro && (
            <a href="/dashboard" onClick={closeMenu} style={{ ...menuLinkStyle, color: '#C4A35A', fontWeight: 700 }}>ダッシュボード</a>
          )}
          <a href="/mycard" onClick={closeMenu} style={menuLinkStyle}>マイプルーフ</a>
          {/* 設定（プロのみ） */}
          {isPro && (
            <>
              <button onClick={() => toggleMenuGroup('settings')} style={{ ...menuGroupLabel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}>
                <span>設定</span>
                <ChevronIcon isOpen={!!openMenuGroups.settings} />
              </button>
              <div style={{ maxHeight: openMenuGroups.settings ? '500px' : '0px', overflow: 'hidden', transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}>
                <a href="/dashboard?tab=profile&edit=true" onClick={closeMenu} style={menuLinkStyle}>プロフィール編集</a>
                <a href="/dashboard?tab=business-info" onClick={closeMenu} style={menuLinkStyle}>サービスメニュー</a>
                <a href="/dashboard?tab=proofs" onClick={closeMenu} style={menuLinkStyle}>強み設定</a>
                <a href="/dashboard?tab=rewards" onClick={closeMenu} style={menuLinkStyle}>リワード設定</a>
                <a href="/dashboard?tab=card" onClick={closeMenu} style={menuLinkStyle}>NFCカード</a>
                {eligibleCertificationTier && (
                  <a
                    href="/dashboard?action=certification"
                    onClick={closeMenu}
                    style={{ ...menuLinkStyle, color: '#C4A35A', fontWeight: 700 }}
                  >
                    {eligibleCertificationTier === 'LEGEND' ? '💎 LEGEND認定申請'
                      : eligibleCertificationTier === 'MASTER' ? '👑 MASTER認定申請'
                      : '🏆 SPECIALIST認定申請'}
                  </a>
                )}
              </div>
            </>
          )}
          {/* 設定（一般ユーザー） */}
          {!isPro && (
            <>
              <button onClick={() => toggleMenuGroup('settings')} style={{ ...menuGroupLabel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}>
                <span>設定</span>
                <ChevronIcon isOpen={!!openMenuGroups.settings} />
              </button>
              <div style={{ maxHeight: openMenuGroups.settings ? '500px' : '0px', overflow: 'hidden', transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}>
                <a href="/mycard?tab=card" onClick={closeMenu} style={menuLinkStyle}>NFCカード</a>
              </div>
            </>
          )}
        </SignedIn>

        {/* 見つける（全員） */}
        <button onClick={() => toggleMenuGroup('discover')} style={{ ...menuGroupLabel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}>
          <span>見つける</span>
          <ChevronIcon isOpen={!!openMenuGroups.discover} />
        </button>
        <div style={{ maxHeight: openMenuGroups.discover ? '500px' : '0px', overflow: 'hidden', transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}>
          <a href="/search" onClick={closeMenu} style={menuLinkStyle}>プロを探す</a>
          <SignedIn>
            <a href="/mycard?tab=bookmarked" onClick={closeMenu} style={menuLinkStyle}>ブックマーク</a>
          </SignedIn>
        </div>

        {/* サポート（全員） */}
        <button onClick={() => toggleMenuGroup('support')} style={{ ...menuGroupLabel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}>
          <span>サポート</span>
          <ChevronIcon isOpen={!!openMenuGroups.support} />
        </button>
        <div style={{ maxHeight: openMenuGroups.support ? '500px' : '0px', overflow: 'hidden', transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}>
          {isPro && (
            <a href="/dashboard?tab=guide" onClick={closeMenu} style={menuLinkStyle}>はじめかたガイド</a>
          )}
          <a href="/for-stores" onClick={closeMenu} style={menuLinkStyle}>店舗・団体の方へ</a>
          <a href="/announcements" onClick={closeMenu} style={{ ...menuLinkStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
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
          <a href="/bug-report" onClick={closeMenu} style={{ ...menuLinkStyle, color: '#888', fontSize: 13 }}>不具合・エラーのご報告</a>
        </div>

        {/* ログアウト / ログイン */}
        <div style={menuDivider}>
          <SignedIn>
            <button
              onClick={() => { closeMenu(); signOut({ redirectUrl: '/' }); }}
              style={{
                ...menuLinkStyle,
                border: 'none', background: 'none', width: '100%',
                textAlign: 'left' as const, color: '#9CA3AF',
              }}
            >
              ログアウト
            </button>
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button
                onClick={closeMenu}
                style={{
                  ...menuLinkStyle,
                  border: 'none', background: 'none', width: '100%',
                  textAlign: 'left' as const, color: '#C4A35A', fontWeight: 600,
                }}
              >
                ログイン
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      </>
    )
  }

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

      {/* 右側: UserButton + ハンバーガー */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <SignedIn>
          <UserButton
            appearance={{
              elements: {
                avatarBox: 'w-8 h-8',
              }
            }}
          />
        </SignedIn>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            color: '#fff', background: 'none', border: 'none',
            fontSize: 22, cursor: 'pointer', padding: 4,
          }}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* 共通ドロップダウンメニュー（PC/モバイル同一） */}
      {menuOpen && (
        <div style={{
          position: 'absolute', top: 56, right: 0,
          background: '#1A1A2E', width: 220,
          padding: '8px 0',
          borderRadius: '0 0 0 12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          zIndex: 100,
        }}>
          {renderMenuItems()}
        </div>
      )}
    </nav>
  )
}
