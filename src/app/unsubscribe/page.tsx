'use client'

/**
 * /unsubscribe?vote_id=xxx[&email=yyy]
 *
 * リワードメールのフッターから飛ばす配信停止ページ。
 * 自動で PATCH /api/votes/[vote_id]/reward-optin (false) を叩く。
 *
 * Phase 1 では vote_id ベース。トークン署名検証は Phase 2 で追加。
 */

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

function UnsubscribeContent() {
  const params = useSearchParams()
  const voteId = params?.get('vote_id') || ''
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'invalid'>('loading')
  const initRef = useRef(false)

  // 依存配列はプリミティブ (voteId: string) のみ
  useEffect(() => {
    if (initRef.current) return
    if (!voteId) {
      setStatus('invalid')
      return
    }
    initRef.current = true

    fetch(`/api/votes/${encodeURIComponent(voteId)}/reward-optin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ reward_optin: false }),
    })
      .then((res) => setStatus(res.ok ? 'success' : 'error'))
      .catch(() => setStatus('error'))
  }, [voteId])

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#FAFAF7',
        fontFamily: "'Hiragino Sans','Noto Sans JP',sans-serif",
      }}
    >
      <div
        style={{
          backgroundColor: '#1A1A2E',
          padding: '20px 24px',
          color: '#C4A35A',
          fontSize: 14,
          letterSpacing: 2,
          fontWeight: 600,
        }}
      >
        REALPROOF
      </div>
      <div
        style={{
          maxWidth: 520,
          margin: '60px auto 0',
          padding: '32px 24px',
          backgroundColor: '#FFF',
          borderRadius: 12,
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}
      >
        <h1 style={{ fontSize: 22, color: '#1A1A2E', margin: '0 0 20px' }}>
          配信停止
        </h1>
        {status === 'loading' && (
          <p style={{ color: '#666', fontSize: 14, lineHeight: 1.7 }}>
            処理中です...
          </p>
        )}
        {status === 'success' && (
          <p style={{ color: '#1A1A2E', fontSize: 15, lineHeight: 1.8 }}>
            配信を停止しました。
            <br />
            今後、REALPROOF からのお知らせメールは届きません。
          </p>
        )}
        {status === 'error' && (
          <p style={{ color: '#C00', fontSize: 14, lineHeight: 1.7 }}>
            エラーが発生しました。
            <br />
            お手数ですが、時間をおいて再度お試しください。
          </p>
        )}
        {status === 'invalid' && (
          <p style={{ color: '#C00', fontSize: 14, lineHeight: 1.7 }}>
            無効なリンクです。
          </p>
        )}
      </div>
    </div>
  )
}

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, color: '#666', fontFamily: 'sans-serif' }}>
          読み込み中...
        </div>
      }
    >
      <UnsubscribeContent />
    </Suspense>
  )
}
