'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useSharedData } from '@/contexts/SharedDataContext'

const LS_KEY = 'dismissed_announcements'

interface Announcement {
  id: string
  title: string
  body: string | null
  link_url: string | null
  link_label: string | null
  banner_type: string
  starts_at: string
}

export default function AnnouncementBanner() {
  const { userId } = useAuth()
  const { latestBanner } = useSharedData()
  const [banner, setBanner] = useState<Announcement | null>(null)
  const [visible, setVisible] = useState(true)
  const [dismissing, setDismissing] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!latestBanner) return
    // 未ログイン → localStorageでdismiss済みをフィルタ
    if (!userId) {
      try {
        const dismissed: string[] = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
        if (dismissed.includes(latestBanner.id)) return
      } catch {
        // localStorage使えない場合はそのまま表示
      }
    }
    setBanner(latestBanner)
  }, [latestBanner, userId])

  if (!banner || !visible) return null

  const borderColor =
    banner.banner_type === 'success' ? '#22C55E' :
    banner.banner_type === 'warning' ? '#F59E0B' :
    '#C4A35A'

  const hasBody = !!banner.body

  async function handleDismiss() {
    setDismissing(true)
    if (userId) {
      // ログイン済み → API経由でDB保存
      try {
        await fetch('/api/announcements/dismiss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ announcement_id: banner!.id }),
        })
      } catch {
        // dismiss失敗でもUIは閉じる
      }
    } else {
      // 未ログイン → localStorageに保存（API呼ばない）
      try {
        const dismissed: string[] = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
        if (!dismissed.includes(banner!.id)) {
          dismissed.push(banner!.id)
          localStorage.setItem(LS_KEY, JSON.stringify(dismissed))
        }
      } catch {
        // localStorage使えない場合は何もしない
      }
    }
    setVisible(false)
  }

  return (
    <div
      style={{
        background: '#1A1A2E',
        borderLeft: `4px solid ${borderColor}`,
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
          <span style={{ fontSize: 14, flexShrink: 0 }}>
            {banner.banner_type === 'success' ? '✅' : banner.banner_type === 'warning' ? '⚠️' : '📢'}
          </span>
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
            {banner.title}
          </span>
          {hasBody && (
            <span style={{ fontSize: 10, color: '#8B8B9A', flexShrink: 0, transition: 'transform 0.3s ease', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              ▼
            </span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleDismiss() }}
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
          <p style={{
            color: '#9CA3AF',
            fontSize: 12,
            lineHeight: 1.5,
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}>
            {banner.body}
          </p>
        </div>
      )}

      {hasBody && (
        <div
          style={{
            maxHeight: expanded ? '2000px' : '0px',
            overflow: 'hidden',
            transition: 'max-height 0.3s ease',
          }}
        >
          <div style={{ padding: '0 16px 12px 38px' }}>
            <p style={{ color: '#D1D5DB', fontSize: 13, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-line' }}>
              {banner.body}
            </p>
            {banner.link_url && (
              <a
                href={banner.link_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'inline-block',
                  marginTop: 10,
                  background: '#C4A35A',
                  color: '#1A1A2E',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                  padding: '8px 16px',
                  borderRadius: 6,
                }}
              >
                {banner.link_label || '詳しく見る'} →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
