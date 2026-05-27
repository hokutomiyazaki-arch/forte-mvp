'use client'

import { useState } from 'react'

/**
 * 公開カード (/card/[id]) のシェアボタン。
 *
 * モバイル: navigator.share() でネイティブシェアシート
 * デスクトップ: navigator.clipboard.writeText() で URL コピー → 2 秒間「コピーしました」表示
 *
 * variant:
 *  - primary: ダッシュボード常設用 (ゴールド bg、ダーク文字)
 *  - compact: 認定到達バナー内用 (小型サイズ、Phase 6 で利用予定)
 */

export interface ShareButtonProps {
  proId: string
  proName: string
  variant?: 'primary' | 'compact'
}

export default function ShareButton({
  proId,
  proName,
  variant = 'primary',
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  const cardUrl = `https://realproof.jp/card/${proId}`
  const shareText = `${proName}のREALPROOFカード — クライアントが証明する本物の強み`

  async function handleShare() {
    // モバイル: ネイティブシェアシートが使えるかチェック
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareText,
          text: shareText,
          url: cardUrl,
        })
      } catch (err) {
        // ユーザがキャンセルした場合は無視 (AbortError)
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err)
        }
      }
      return
    }

    // デスクトップ: URL コピー → 2 秒間「コピーしました」表示
    try {
      await navigator.clipboard.writeText(cardUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  const isCompact = variant === 'compact'

  return (
    <button
      type="button"
      onClick={handleShare}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: isCompact ? '8px 14px' : '12px 20px',
        background: '#C4A35A',
        color: '#1A1A2E',
        border: 'none',
        borderRadius: 10,
        fontSize: isCompact ? 13 : 14,
        fontWeight: 700,
        letterSpacing: 0.3,
        cursor: 'pointer',
        transition: 'opacity 0.2s',
        whiteSpace: 'nowrap',
      }}
      onMouseOver={(e) => (e.currentTarget.style.opacity = '0.85')}
      onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
    >
      <svg
        width={isCompact ? 14 : 16}
        height={isCompact ? 14 : 16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
      {copied ? 'コピーしました' : 'シェア'}
    </button>
  )
}
