'use client'

import { useState } from 'react'

export const dynamic = 'force-dynamic'

/**
 * (A) 登録シーケンスの購入画面
 * 新規プロ登録の直後(コミット地点)に一度だけ表示するNFCカード購入案内。
 * スキップ可能・一回きり(押した時点で professionals.nfc_onboarding_dismissed_at をセット)。
 * 出し分け(表示するかどうかの判定)は Phase 4 の配線側で行う。このページ自体は「来たら表示」でよい。
 */
export default function OnboardingNfcPage() {
  const [loadingAction, setLoadingAction] = useState<'buy' | 'skip' | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const dismiss = async () => {
    try {
      await fetch('/api/onboarding/nfc-dismiss', {
        method: 'POST',
        cache: 'no-store',
      })
    } catch (err) {
      // fail open: dismiss API が失敗してもユーザーの操作は止めない
      console.error('[onboarding/nfc] dismiss failed:', err)
    }
  }

  const handleBuy = async () => {
    setErrorMessage('')
    setLoadingAction('buy')
    await dismiss()
    try {
      const res = await fetch('/api/card-order/checkout', {
        method: 'POST',
        cache: 'no-store',
      })
      const data = await res.json()
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
      setErrorMessage('決済ページの作成に失敗しました。もう一度お試しください。')
      setLoadingAction(null)
    } catch (err) {
      console.error('[onboarding/nfc] checkout failed:', err)
      setErrorMessage('決済ページの作成に失敗しました。もう一度お試しください。')
      setLoadingAction(null)
    }
  }

  const handleSkip = async () => {
    setLoadingAction('skip')
    await dismiss()
    // fail open: dismiss が失敗してもダッシュボードへは必ず進める
    window.location.href = '/dashboard'
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FAFAF7',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
      }}
    >
      {/* ロゴ */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: 4,
          color: '#1A1A2E',
          marginBottom: 8,
        }}
      >
        REALPROOF
      </div>

      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/lp/nfc-card/hero.jpg"
          alt="REALPROOF NFCカード"
          style={{
            width: '100%',
            borderRadius: 16,
            marginBottom: 24,
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          }}
        />

        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 16,
            color: '#1A1A2E',
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          最初の1件を、いちばん集めやすくする
        </h1>

        <p
          style={{
            fontSize: 14,
            color: '#555',
            lineHeight: 1.8,
            marginBottom: 24,
            textAlign: 'center',
          }}
        >
          NFCカードをお客さんのスマホにタッチ(またはQR)してもらうだけで、あなたの強みの記録が集まります。名刺やスマホに貼って、セッションの最後にひとタッチ。
        </p>

        <div
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: '#1A1A2E',
            textAlign: 'center',
            marginBottom: 4,
          }}
        >
          ¥3,000
        </div>
        <p
          style={{
            fontSize: 12,
            color: '#888',
            textAlign: 'center',
            marginBottom: 32,
          }}
        >
          送料込み・買い切り
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={handleBuy}
            disabled={loadingAction !== null}
            style={{
              background: '#1A1A2E',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '18px 24px',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
              opacity: loadingAction !== null ? 0.6 : 1,
            }}
          >
            {loadingAction === 'buy' ? '処理中...' : 'カードを購入する'}
          </button>

          <button
            onClick={handleSkip}
            disabled={loadingAction !== null}
            style={{
              background: 'transparent',
              color: '#888',
              border: '1px solid #E8E4DC',
              borderRadius: 12,
              padding: '16px 24px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: loadingAction !== null ? 0.6 : 1,
            }}
          >
            {loadingAction === 'skip' ? '処理中...' : 'あとで(スキップ)'}
          </button>
        </div>

        {errorMessage && (
          <p style={{ fontSize: 13, color: '#e74c3c', marginTop: 16, textAlign: 'center' }}>
            {errorMessage}
          </p>
        )}

        <p
          style={{
            fontSize: 12,
            color: '#aaa',
            textAlign: 'center',
            marginTop: 24,
          }}
        >
          あとからいつでもダッシュボードから購入できます。
        </p>
      </div>
    </div>
  )
}
