'use client'

import { useEffect, useState } from 'react'
import BookingThread from '@/components/dashboard/BookingThread'

/** タスク⑥改(CEO指摘): 完了した紹介(受け手側)。ダッシュボード最上部に常駐させると
 * 邪魔になるため、紹介タブ内に移設した独立コンポーネント。デフォルト閉の折りたたみ。 */
interface CompletedBookingItem {
  id: string
  list_id: string
  menu_id: string | null
  menu_name: string | null
  status: 'completed'
  price_jpy: number
  handover_note: { theme?: string; history?: string; tried?: string; notes?: string } | null
  confirmed_at: string | null
  completed_at: string | null
  created_at: string
  client_nickname: string
  sender_pro: { id: string; name: string } | null
}

interface Props {
  proId: string
}

export default function ReferralCompletedList({ proId }: Props) {
  const [completedItems, setCompletedItems] = useState<CompletedBookingItem[]>([])
  const [completedOpen, setCompletedOpen] = useState(false)

  useEffect(() => {
    fetch('/api/referral/bookings/received', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.completed) setCompletedItems(data.completed)
      })
      .catch(() => {})
  }, [])

  if (completedItems.length === 0) return null

  return (
    <div
      style={{
        background: '#FAFAFA',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: '10px 16px',
      }}
    >
      <button
        onClick={() => setCompletedOpen((prev) => !prev)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 700,
          color: '#1A1A2E',
        }}
      >
        <span>完了した紹介({completedItems.length}件)</span>
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>{completedOpen ? '▲' : '▼'}</span>
      </button>

      {completedOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {completedItems.map((item) => (
            <div
              key={item.id}
              style={{
                background: '#fff',
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 1.6 }}>
                <strong>{item.client_nickname}さん</strong>とのセッションは完了しています
                {item.sender_pro?.name && (
                  <span style={{ color: '#6B7280' }}>(紹介元: {item.sender_pro.name}さん)</span>
                )}
              </div>
              {item.completed_at && (
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                  完了日: {new Date(item.completed_at).toLocaleDateString('ja-JP')}
                </div>
              )}
              {item.menu_name && (
                <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>メニュー: {item.menu_name}</div>
              )}
              <BookingThread
                bookingId={item.id}
                ownProId={proId}
                isSender={false}
                initialHandoverNote={item.handover_note}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
