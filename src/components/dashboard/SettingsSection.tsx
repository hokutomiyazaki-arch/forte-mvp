'use client'

import type { ReactNode } from 'react'

/**
 * 設定画面の1ブロックを畳めるようにする共通アコーディオン（CEO指示 2026-08-06）。
 *
 * 見た目は「はじめかたガイド」タブの既存アコーディオン（dashboard/page.tsx）に合わせている。
 * 同じ形のアコーディオンをプロフィール編集・サービス設定の2画面で使うため、
 * コピペで少しずつズレるのを避けて最初から共通化する（CLAUDE.md G）。
 *
 * 重要:
 * - 閉じている間は children を **アンマウント**する（display:none にしない）。
 *   フォーム内で display:none の required 入力があると、送信時にブラウザが
 *   「focus できない不正な入力がある」として無言で送信を止めるため。
 * - フォームの中で使うので button は必ず type="button"（暗黙の submit を防ぐ）。
 */
interface Props {
  title: string
  /** 見出しの右に付ける小さな目印（New など・任意） */
  titleBadge?: ReactNode
  /** 見出しの下に出る補足（任意） */
  description?: string
  open: boolean
  onToggle: () => void
  /** 見出し右側の補助表示（件数・設定済みの値など）。開閉マークの左に出る。 */
  meta?: ReactNode
  children: ReactNode
}

export default function SettingsSection({ title, titleBadge, description, open, onToggle, meta, children }: Props) {
  return (
    <div
      style={{
        border: '1px solid #E5E7EB',
        borderRadius: 8,
        marginBottom: 8,
        overflow: 'hidden',
        background: 'white',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          background: 'white',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left' as const,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>
            {title}
            {titleBadge}
          </div>
          {description && (
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2, lineHeight: 1.5 }}>{description}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {meta && <span style={{ fontSize: 12, color: '#9CA3AF' }}>{meta}</span>}
          <span style={{ color: '#C4A35A', fontSize: 16 }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div style={{ background: '#F9FAFB', padding: 16, borderTop: '1px solid #E5E7EB' }}>{children}</div>
      )}
    </div>
  )
}
