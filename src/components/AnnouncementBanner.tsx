'use client'

import { useEffect, useState } from 'react'

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
  const [banner, setBanner] = useState<Announcement | null>(null)
  const [visible, setVisible] = useState(true)
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => {
    fetch('/api/announcements')
      .then(res => res.json())
      .then(data => {
        if (data.latest) {
          setBanner(data.latest)
        }
      })
      .catch(() => {})
  }, [])

  if (!banner || !visible) return null

  const borderColor =
    banner.banner_type === 'success' ? '#22C55E' :
    banner.banner_type === 'warning' ? '#F59E0B' :
    '#C4A35A'

  async function handleDismiss() {
    setDismissing(true)
    try {
      await fetch('/api/announcements/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ announcement_id: banner!.id }),
      })
    } catch {
      // dismiss失敗でもUIは閉じる
    }
    setVisible(false)
  }

  return (
    <div
      style={{
        background: '#1A1A2E',
        borderLeft: `4px solid ${borderColor}`,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        minHeight: 44,
        opacity: dismissing ? 0 : 1,
        transition: 'opacity 0.3s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>
          {banner.banner_type === 'success' ? '✅' : banner.banner_type === 'warning' ? '⚠️' : '📢'}
        </span>
        {banner.link_url ? (
          <a
            href={banner.link_url}
            style={{
              color: '#FAFAF7',
              fontSize: 13,
              fontWeight: 500,
              textDecoration: 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
            }}
          >
            {banner.title}
          </a>
        ) : (
          <span
            style={{
              color: '#FAFAF7',
              fontSize: 13,
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
            }}
          >
            {banner.title}
          </span>
        )}
      </div>
      <button
        onClick={handleDismiss}
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
  )
}
