'use client'

import { useState, type ReactNode } from 'react'

/**
 * お知らせバナーの見た目（CEO指示 2026-08-06「バナーの出し方が admin dashboard と違う。
 * 差分を検証して、そのとおりにして」）。
 *
 * admin から配信するお知らせ（AnnouncementBanner）と、アプリが自分で出すお知らせ
 * （InlineNoticeBanner）で、余白・文字サイズ・角丸が微妙に違っていた。
 * **見た目を2箇所に持たない**ためにここへ寄せる（CLAUDE.md §G「ほとんど同じだけど
 * 少し違う実装は diff の時点で共通化」）。以後この見た目を変えるときはこのファイルだけ直す。
 *
 * 値は AnnouncementBanner（配信お知らせ＝正）の実装をそのまま持ってきている:
 *   帯: background #1A1A2E / borderLeft 4px（種別色）/ 角丸なし
 *   1行目: padding 10px 16px・minHeight 44・アイコン14px・見出し13px/500・省略記号
 *   畳んだ本文: padding 0 16px 8px 38px・12px・#9CA3AF・2行クランプ
 *   開いた本文: padding 0 16px 12px 38px・13px・#D1D5DB・行間1.6
 *   CTA: #C4A35A / #1A1A2E・13px/600・padding 8px 16px・角丸6
 *   ✕: #8B8B9A・16px・padding 2px 4px
 */

export type NoticeBannerType = 'info' | 'success' | 'warning'

export function noticeBorderColor(type: NoticeBannerType): string {
  return type === 'success' ? '#22C55E' : type === 'warning' ? '#F59E0B' : '#C4A35A'
}

export function noticeIcon(type: NoticeBannerType): string {
  return type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '📢'
}

interface Props {
  type: NoticeBannerType
  title: string
  body?: string | null
  /** ✕ を押したとき。呼び出し側で「閉じたこと」を保存する */
  onDismiss: () => void
  /** 閉じるときのフェード用（AnnouncementBanner が持っていた挙動） */
  dismissing?: boolean
  /** 本文の下に出すボタン/リンク（開いた時だけ見える） */
  action?: ReactNode
}

export default function NoticeBannerShell({ type, title, body, onDismiss, dismissing, action }: Props) {
  const [expanded, setExpanded] = useState(false)
  const hasBody = !!body

  return (
    <div
      style={{
        background: '#1A1A2E',
        borderLeft: `4px solid ${noticeBorderColor(type)}`,
        opacity: dismissing ? 0 : 1,
        transition: 'opacity 0.3s ease',
      }}
    >
      <div
        style={{
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          minHeight: 44,
          cursor: hasBody ? 'pointer' : 'default',
        }}
        onClick={hasBody ? () => setExpanded(!expanded) : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 14, flexShrink: 0 }} aria-hidden="true">{noticeIcon(type)}</span>
          <span
            style={{
              color: '#FAFAF7',
              fontSize: 13,
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
              flex: 1,
            }}
          >
            {title}
          </span>
          {hasBody && (
            <span
              style={{
                fontSize: 10,
                color: '#8B8B9A',
                flexShrink: 0,
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
          onClick={(e) => { e.stopPropagation(); onDismiss() }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#8B8B9A',
            fontSize: 16,
            cursor: 'pointer',
            padding: '2px 4px',
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {hasBody && !expanded && (
        <div style={{ padding: '0 16px 8px 38px', cursor: 'pointer' }} onClick={() => setExpanded(true)}>
          <p
            style={{
              color: '#9CA3AF',
              fontSize: 12,
              lineHeight: 1.5,
              margin: 0,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
            }}
          >
            {body}
          </p>
        </div>
      )}

      {hasBody && (
        <div style={{ maxHeight: expanded ? '2000px' : '0px', overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
          <div style={{ padding: '0 16px 12px 38px' }}>
            <p style={{ color: '#D1D5DB', fontSize: 13, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-line' }}>
              {body}
            </p>
            {action}
          </div>
        </div>
      )}
    </div>
  )
}

/** CTA の見た目（配信お知らせのリンクと同じ）。button/a のどちらにも使う。 */
export const noticeActionStyle = {
  display: 'inline-block',
  marginTop: 10,
  background: '#C4A35A',
  color: '#1A1A2E',
  fontSize: 13,
  fontWeight: 600 as const,
  textDecoration: 'none',
  border: 'none',
  padding: '8px 16px',
  borderRadius: 6,
  cursor: 'pointer',
}
