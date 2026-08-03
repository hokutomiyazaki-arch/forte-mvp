'use client'

import { useEffect, useState } from 'react'
import { formatSlot } from '@/lib/referral-format'
import BookingThread from '@/components/dashboard/BookingThread'

interface BookingItem {
  id: string
  list_id: string
  menu_id: string | null
  menu_name: string | null
  theme_tags: string[] | null
  preferred_slots: { slots?: (string | null)[]; note?: string | null; confirmed_index?: number } | null
  status: 'requested' | 'confirmed'
  price_jpy: number
  /** §2-4ステージ3(予約フィー方式): 決済有効時のみ入る。金額・連絡先は含まれない(status相当のみ)。 */
  payment_status?: string | null
  handover_note: { theme?: string; history?: string; tried?: string; notes?: string } | null
  expires_at: string | null
  confirmed_at: string | null
  created_at: string
  client_nickname: string
  sender_pro: { id: string; name: string } | null
}

interface Props {
  /** §2-10: 案件スレッドの参加者判定に使う自分のprofessionals.id。未指定時はスレッドを表示しない。 */
  proId?: string
}

/**
 * §2-4/§4-8: 受信した予約リクエストの確定・辞退カード。
 * §2-10: 確定済み予約には案件スレッド・引き継ぎメモの開閉式ビューを表示する。
 * ★ isReferralEnabled ではゲートしない(受け手は先行アクセス外でもリクエストを受けられる必要がある)。
 * ダッシュボード上部に、タブに依存せず常時表示する。
 */
export default function ReferralBookingReceivedCard({ proId }: Props) {
  const [items, setItems] = useState<BookingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Record<string, number>>({})

  useEffect(() => {
    fetch('/api/referral/bookings/received', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.bookings) setItems(data.bookings)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const requestedItems = items.filter((i) => i.status === 'requested')
  const confirmedItems = items.filter((i) => i.status === 'confirmed')

  async function confirm(bookingId: string) {
    const index = selectedSlot[bookingId]
    if (index === undefined) {
      window.alert('確定する希望日時を選んでください')
      return
    }
    setProcessingId(bookingId)
    try {
      const res = await fetch('/api/referral/bookings/received', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, action: 'confirm', confirmed_index: index }),
      })
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== bookingId))
      } else {
        window.alert('確定に失敗しました')
      }
    } finally {
      setProcessingId(null)
    }
  }

  async function decline(bookingId: string) {
    if (!window.confirm('この予約リクエストを辞退しますか？')) return
    setProcessingId(bookingId)
    try {
      const res = await fetch('/api/referral/bookings/received', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, action: 'decline' }),
      })
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== bookingId))
      } else {
        window.alert('処理に失敗しました')
      }
    } finally {
      setProcessingId(null)
    }
  }

  /** §2-4-7(決済なし版)/中11: 成立・完了の記録。通知なし(Phase 2で扱う)。 */
  async function complete(bookingId: string) {
    if (!window.confirm('この紹介セッションを完了しますか？')) return
    setProcessingId(bookingId)
    try {
      const res = await fetch('/api/referral/bookings/received', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ booking_id: bookingId, action: 'complete' }),
      })
      if (res.ok) {
        // タスク⑥改: 完了一覧は紹介タブ内のReferralCompletedListが表示する(タブを開いた時に取得)
        setItems((prev) => prev.filter((i) => i.id !== bookingId))
      } else {
        // レビュー指摘(重大2): ボタンをdisabledにしていても、支払い完了直前などの
        // 競合でここに来ることがあるため専用文言を出す。
        const data = await res.json().catch(() => ({}))
        if (data.error === 'payment_pending') {
          window.alert('クライアントのお支払いが完了していないため、完了できません')
        } else {
          window.alert('処理に失敗しました')
        }
      }
    } finally {
      setProcessingId(null)
    }
  }

  if (loading || (requestedItems.length === 0 && confirmedItems.length === 0)) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
      {requestedItems.map((item) => {
        const slots = item.preferred_slots?.slots || []
        const theme = item.theme_tags?.[0] || null
        const note = item.preferred_slots?.note || null
        return (
          <div
            key={item.id}
            style={{
              background: '#F0F7FF',
              border: '1px solid #B8D4F0',
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 1.6, marginBottom: 8 }}>
              <strong>{item.client_nickname}さん</strong>から予約リクエストが届いています
              {item.sender_pro?.name && (
                <span style={{ color: '#6B7280' }}>(紹介元: {item.sender_pro.name}さん)</span>
              )}
            </div>
            {theme && <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>テーマ: {theme}</div>}
            {item.menu_name && <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>メニュー: {item.menu_name}</div>}
            {note && <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>補足: {note}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {slots.map((slot, i) =>
                slot ? (
                  <label
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      color: '#1A1A2E',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name={`slot-${item.id}`}
                      checked={selectedSlot[item.id] === i}
                      onChange={() => setSelectedSlot((prev) => ({ ...prev, [item.id]: i }))}
                    />
                    第{i + 1}希望: {formatSlot(slot)}
                  </label>
                ) : null
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => confirm(item.id)}
                disabled={processingId === item.id}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#C4A35A',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: processingId === item.id ? 'default' : 'pointer',
                  opacity: processingId === item.id ? 0.6 : 1,
                }}
              >
                この日時で確定する
              </button>
              <button
                onClick={() => decline(item.id)}
                disabled={processingId === item.id}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #D1D5DB',
                  background: '#fff',
                  color: '#6B7280',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: processingId === item.id ? 'default' : 'pointer',
                  opacity: processingId === item.id ? 0.6 : 1,
                }}
              >
                辞退する
              </button>
            </div>
          </div>
        )
      })}

      {proId &&
        confirmedItems.map((item) => (
          <div
            key={item.id}
            style={{
              background: '#F9FFF9',
              border: '1px solid #C8E6C9',
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 1.6 }}>
              <strong>{item.client_nickname}さん</strong>との相談が確定しています
              {item.sender_pro?.name && (
                <span style={{ color: '#6B7280' }}>(紹介元: {item.sender_pro.name}さん)</span>
              )}
            </div>
            {/* §2-4ステージ3(予約フィー方式): 決済リンク送付済み・未払いの間はバッジを表示し、
                完了ボタンをdisabledにする(レビュー指摘・重大2: フィー未収のまま完了させない)。
                金額・連絡先は出さない。 */}
            {item.payment_status === 'awaiting' && (
              <div
                style={{
                  display: 'inline-block',
                  marginTop: 6,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: '#FFF3E0',
                  color: '#B26A00',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                クライアントのお支払い待ち
              </div>
            )}
            <BookingThread
              bookingId={item.id}
              ownProId={proId}
              isSender={false}
              initialHandoverNote={item.handover_note}
            />
            <button
              onClick={() => complete(item.id)}
              disabled={processingId === item.id || item.payment_status === 'awaiting'}
              style={{
                marginTop: 10,
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #C4A35A',
                background: '#fff',
                color: '#C4A35A',
                fontSize: 13,
                fontWeight: 600,
                cursor: processingId === item.id || item.payment_status === 'awaiting' ? 'default' : 'pointer',
                opacity: processingId === item.id || item.payment_status === 'awaiting' ? 0.6 : 1,
              }}
            >
              紹介セッションを完了する
            </button>
            {item.payment_status === 'awaiting' && (
              <p style={{ marginTop: 4, fontSize: 11, color: '#B26A00' }}>
                クライアントのお支払い完了後に完了できます
              </p>
            )}
          </div>
        ))}

    </div>
  )
}
