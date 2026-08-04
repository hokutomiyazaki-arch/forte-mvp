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
  /** §2-4ステージ3(決済確認後の連絡先開示・CEO決定): 開示条件を満たす場合のみAPIから入る。 */
  client_contact: { name: string | null; phone: string | null; email: string | null } | null
}

interface Props {
  proId: string
  /** UI再構成(2026-08-04・CEO承認済み): 「紹介を受ける」サブタブの空状態判定用に、
   * 完了件数と読み込み完了フラグを親へ通知する(データ取得ロジックは変更しない・
   * 既存fetch結果の件数を渡すだけ)。レビュー指摘(軽微7): loadedを渡し、
   * received/completedの到着順による空状態フラッシュを防ぐ。 */
  onCountChange?: (count: number, loaded: boolean) => void
}

export default function ReferralCompletedList({ proId, onCountChange }: Props) {
  const [completedItems, setCompletedItems] = useState<CompletedBookingItem[]>([])
  const [completedOpen, setCompletedOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/referral/bookings/received', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.completed) setCompletedItems(data.completed)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const completedCount = completedItems.length
  useEffect(() => {
    onCountChange?.(completedCount, !loading)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedCount, loading])

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
              {/* §2-4ステージ3(決済確認後の連絡先開示・CEO決定): 履歴としても確認できるよう表示する。 */}
              {item.client_contact && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '10px 12px',
                    background: '#FAFAFA',
                    border: '1px solid #E5E7EB',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1A1A2E', marginBottom: 4 }}>
                    クライアント連絡先
                  </div>
                  {item.client_contact.name && (
                    <div style={{ fontSize: 12, color: '#1A1A2E' }}>{item.client_contact.name}さん</div>
                  )}
                  {item.client_contact.phone && (
                    <div style={{ fontSize: 12, color: '#1A1A2E' }}>
                      電話:{' '}
                      <a href={`tel:${encodeURIComponent(item.client_contact.phone)}`} style={{ color: '#1A6B3C' }}>
                        {item.client_contact.phone}
                      </a>
                    </div>
                  )}
                  {item.client_contact.email && (
                    <div style={{ fontSize: 12, color: '#1A1A2E' }}>
                      メール:{' '}
                      <a href={`mailto:${encodeURIComponent(item.client_contact.email)}`} style={{ color: '#1A6B3C' }}>
                        {item.client_contact.email}
                      </a>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
                    日程の調整・当日のご連絡はこちらへ直接どうぞ
                  </div>
                </div>
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
