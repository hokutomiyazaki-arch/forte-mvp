'use client'

import { useState } from 'react'

/**
 * アプリ内お知らせの見た目を1つに統一するための共通バナー（CEO指示 2026-08-06）。
 *
 * CEO報告:
 *   「この上の通知、一度タップした後に消えないし、なにも出来ない。反応しない。
 *    消すボタンをつけて欲しいのと、通知方法は admin dashboard で使っている
 *    バナー通知に統一して。」
 *
 * そこで:
 *   ① 見た目を AnnouncementBanner（admin から配信するお知らせ）と同じにする
 *      —— 濃紺の帯・左に色のライン・アイコン・右端に ✕。
 *   ② **必ず消せる**。✕ で閉じ、閉じたことは localStorage に残す（再訪しても出ない）。
 *   ③ CTA は onAction を優先する。理由は下記。
 *
 * ⚠️ CTA を「同じページへの Link」にしてはいけない（今回の「反応しない」の真因）:
 *   ダッシュボード内のバナーが `/dashboard?tab=profile&edit=true` へリンクしていたが、
 *   受け側の useEffect は「マウント後1回だけ」開く作りで、しかも開いた直後に
 *   window.history.replaceState で edit を消していた。replaceState は Next の
 *   router に伝わらないため useSearchParams が更新されず、2回目以降のタップは
 *   同じ状態のまま何も起きない。同一ページ内の操作は URL を経由せず、
 *   onAction で直接やらせる。
 */

const LS_KEY = 'dismissed_inline_notices'

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export interface InlineNoticeBannerProps {
  /** 閉じた状態を覚えるためのキー（バナーごとに固定の文字列） */
  id: string
  title: string
  body?: string
  /** 帯の左ラインの色分け。admin のお知らせと同じ3種 */
  type?: 'info' | 'success' | 'warning'
  actionLabel?: string
  /** 同じページ内で完結する操作（推奨） */
  onAction?: () => void
  /** 別ページへ移動する場合だけ使う */
  href?: string
}

export default function InlineNoticeBanner({
  id,
  title,
  body,
  type = 'info',
  actionLabel,
  onAction,
  href,
}: InlineNoticeBannerProps) {
  // 初期値の計算で localStorage を読む（描画後にチラッと出てから消えるのを防ぐ）。
  // SSR では window が無いので false 相当（= 表示）になり、クライアントで再評価される。
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return readDismissed().includes(id)
  })
  const [expanded, setExpanded] = useState(false)

  if (dismissed) return null

  const borderColor = type === 'success' ? '#22C55E' : type === 'warning' ? '#F59E0B' : '#C4A35A'
  const icon = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '📢'
  const hasBody = !!body

  function handleDismiss() {
    setDismissed(true)
    try {
      const list = readDismissed()
      if (!list.includes(id)) {
        list.push(id)
        localStorage.setItem(LS_KEY, JSON.stringify(list))
      }
    } catch {
      // localStorage が使えなくても、この画面では閉じたままにする
    }
  }

  return (
    <div
      style={{
        background: '#1A1A2E',
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: 8,
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          minHeight: 44,
          cursor: hasBody ? 'pointer' : 'default',
        }}
        onClick={hasBody ? () => setExpanded(v => !v) : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 14, flexShrink: 0 }} aria-hidden="true">{icon}</span>
          <span
            style={{
              color: '#FAFAF7', fontSize: 13, fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1,
            }}
          >
            {title}
          </span>
          {hasBody && (
            <span
              style={{
                fontSize: 10, color: '#8B8B9A', flexShrink: 0,
                transition: 'transform 0.3s ease',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              ▼
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label="このお知らせを閉じる"
          onClick={(e) => { e.stopPropagation(); handleDismiss() }}
          style={{
            background: 'transparent', border: 'none', color: '#8B8B9A',
            fontSize: 16, cursor: 'pointer', padding: '2px 6px', flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {hasBody && !expanded && (
        <div style={{ padding: '0 12px 8px 34px', cursor: 'pointer' }} onClick={() => setExpanded(true)}>
          <p
            style={{
              color: '#9CA3AF', fontSize: 12, lineHeight: 1.5, margin: 0,
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
            }}
          >
            {body}
          </p>
        </div>
      )}

      {hasBody && (
        <div style={{ maxHeight: expanded ? '2000px' : '0px', overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
          <div style={{ padding: '0 12px 12px 34px' }}>
            <p style={{ color: '#D1D5DB', fontSize: 13, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-line' }}>
              {body}
            </p>
            {actionLabel && (onAction || href) && (
              onAction ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onAction() }}
                  style={{
                    display: 'inline-block', marginTop: 10, background: '#C4A35A', color: '#1A1A2E',
                    fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 6,
                    padding: '8px 16px', cursor: 'pointer',
                  }}
                >
                  {actionLabel} →
                </button>
              ) : (
                <a
                  href={href}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'inline-block', marginTop: 10, background: '#C4A35A', color: '#1A1A2E',
                    fontSize: 13, fontWeight: 600, textDecoration: 'none',
                    padding: '8px 16px', borderRadius: 6,
                  }}
                >
                  {actionLabel} →
                </a>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
