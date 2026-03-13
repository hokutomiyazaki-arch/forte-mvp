'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const { isSignedIn, isLoaded } = useAuth()
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return

    // Already in standalone mode — don't show
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if ((window.navigator as any).standalone === true) return

    // Check cookie dismiss
    if (document.cookie.includes('pwa_dismissed=1')) return

    const ua = window.navigator.userAgent
    const iosDevice = /iPhone|iPad|iPod/.test(ua) && !(window as any).MSStream

    if (iosDevice) {
      // iOS: check if not in standalone
      setIsIOS(true)
      setTimeout(() => setShow(true), 3000)
    } else {
      // Android / others: listen for beforeinstallprompt
      const handler = (e: Event) => {
        e.preventDefault()
        setDeferredPrompt(e as BeforeInstallPromptEvent)
        setTimeout(() => setShow(true), 3000)
      }
      window.addEventListener('beforeinstallprompt', handler)
      return () => window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [isLoaded, isSignedIn])

  const dismiss = () => {
    setShow(false)
    document.cookie = 'pwa_dismissed=1; path=/; max-age=604800' // 7 days
  }

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
      setDeferredPrompt(null)
      setShow(false)
    }
  }

  if (!show) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div
        style={{
          background: '#1A1A2E',
          color: '#fff',
          padding: '16px 20px',
          margin: '0 12px 12px',
          borderRadius: 16,
          boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        {/* App icon */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: '#C4A35A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 20,
            fontWeight: 800,
            color: '#fff',
            letterSpacing: 1,
          }}
        >
          R
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
            ホーム画面に追加
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
            {isIOS
              ? '下の共有ボタン → 「ホーム画面に追加」'
              : 'アプリのように素早くアクセス'}
          </div>
        </div>

        {/* Action */}
        {!isIOS && deferredPrompt ? (
          <button
            onClick={handleInstall}
            style={{
              background: '#C4A35A',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            追加
          </button>
        ) : null}

        {/* Close button */}
        <button
          onClick={dismiss}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            fontSize: 20,
            cursor: 'pointer',
            padding: '4px 0',
            lineHeight: 1,
            flexShrink: 0,
          }}
          aria-label="閉じる"
        >
          ×
        </button>
      </div>
    </div>
  )
}
