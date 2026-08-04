'use client'

import { useEffect, useState } from 'react'
import { formatSlot, formatSlotWithWeekday } from '@/lib/referral-format'
import BookingThread from '@/components/dashboard/BookingThread'

interface BookingItem {
  id: string
  list_id: string
  menu_id: string | null
  menu_name: string | null
  theme_tags: string[] | null
  preferred_slots: {
    slots?: (string | null)[]
    note?: string | null
    confirmed_index?: number
    /** ライフサイクル改善(タスクA・逆指定): 受け手が提案した別日時。クライアントの返答待ちの目印。 */
    counter_slots?: string[]
    /** ライフサイクル改善(タスクB): クライアントが承諾したcounter_slotsのindex */
    confirmed_counter_index?: number
  } | null
  status: 'requested' | 'confirmed'
  price_jpy: number
  /** §2-4ステージ3(予約フィー方式): 決済有効時のみ入る。金額は含まれない(status相当のみ)。 */
  payment_status?: string | null
  handover_note: { theme?: string; history?: string; tried?: string; notes?: string } | null
  expires_at: string | null
  confirmed_at: string | null
  created_at: string
  client_nickname: string
  sender_pro: { id: string; name: string } | null
  /** §2-4ステージ3(決済確認後の連絡先開示・CEO決定): 開示条件を満たす場合のみAPIから入る。 */
  client_contact: { name: string | null; phone: string | null; email: string | null } | null
}

/**
 * タスク①(2026-08-04・CEO指示): 支払い期限切れで自動キャンセルされた紹介予約(受け手向け)。
 * 連絡先(client_contact)は含めない(開示条件外・PII厳守)。
 */
interface CancelledUnpaidItem {
  id: string
  menu_name: string | null
  preferred_slots: {
    slots?: (string | null)[]
    confirmed_index?: number
    counter_slots?: string[]
    confirmed_counter_index?: number
  } | null
  confirmed_at: string | null
  client_nickname: string
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
  const [cancelledUnpaidItems, setCancelledUnpaidItems] = useState<CancelledUnpaidItem[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Record<string, number>>({})
  // ライフサイクル改善(タスクA・逆指定): 「別の日時を提案する」の開閉と入力値(bookingIdごと)
  const [counterOpenId, setCounterOpenId] = useState<string | null>(null)
  const [counterInputs, setCounterInputs] = useState<Record<string, [string, string, string]>>({})

  useEffect(() => {
    fetch('/api/referral/bookings/received', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.bookings) setItems(data.bookings)
        if (data?.cancelled_unpaid) setCancelledUnpaidItems(data.cancelled_unpaid)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  /** タスク①: preferred_slotsから確定日時のisoを解決する(counter経由/通常3枠経由の両方に対応)。 */
  function resolveConfirmedSlotIso(preferredSlots: CancelledUnpaidItem['preferred_slots']): string | null {
    if (typeof preferredSlots?.confirmed_counter_index === 'number') {
      return preferredSlots.counter_slots?.[preferredSlots.confirmed_counter_index] || null
    }
    if (typeof preferredSlots?.confirmed_index === 'number') {
      return preferredSlots.slots?.[preferredSlots.confirmed_index] || null
    }
    return null
  }

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
        // レビューFAIL修正(中1): 別日時を提案済みの間は通常confirmが409で拒否される
        const data = await res.json().catch(() => ({}))
        if (data.error === 'counter_pending') {
          window.alert('別日時を提案済みです。クライアントの返答をお待ちください')
        } else {
          window.alert('確定に失敗しました')
        }
      }
    } finally {
      setProcessingId(null)
    }
  }

  async function decline(bookingId: string) {
    if (!window.confirm('この紹介予約のリクエストを辞退しますか？')) return
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

  /** ライフサイクル改善(タスクA・逆指定): 別日時(最大3件・第1のみ必須)を提案する */
  async function submitCounter(bookingId: string) {
    const inputs = counterInputs[bookingId] || ['', '', '']
    const [slot1, slot2, slot3] = inputs
    if (!slot1) {
      window.alert('第1希望の日時を入力してください')
      return
    }
    setProcessingId(bookingId)
    try {
      const res = await fetch('/api/referral/bookings/received', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          booking_id: bookingId,
          action: 'counter',
          counter_slots: [slot1, slot2 || null, slot3 || null].filter(Boolean),
        }),
      })
      if (res.ok) {
        setCounterOpenId(null)
        // 一覧の再取得(counter_slotsを反映した「提案済み」表示に切り替えるため)
        const refreshed = await fetch('/api/referral/bookings/received', { cache: 'no-store' })
        const data = await refreshed.json().catch(() => null)
        if (data?.bookings) setItems(data.bookings)
      } else {
        // レビューFAIL修正(軽微1): 再提案は1回まで(UIは提案済み表示で隠れるが直叩き対策の文言)
        const data = await res.json().catch(() => ({}))
        if (data.error === 'counter_already_proposed') {
          window.alert('既に別日時を提案済みです')
        } else {
          window.alert('提案の送信に失敗しました')
        }
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

  /** タスク①(2026-08-04・CEO指示): 支払い期限切れキャンセルカードを閉じる(window.confirm不要)。 */
  async function dismissCancelled(bookingId: string) {
    setProcessingId(bookingId)
    try {
      const res = await fetch('/api/referral/bookings/received', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ booking_id: bookingId, action: 'dismiss_cancelled' }),
      })
      if (res.ok) {
        setCancelledUnpaidItems((prev) => prev.filter((i) => i.id !== bookingId))
      } else {
        window.alert('処理に失敗しました')
      }
    } finally {
      setProcessingId(null)
    }
  }

  if (
    loading ||
    (requestedItems.length === 0 && confirmedItems.length === 0 && cancelledUnpaidItems.length === 0)
  )
    return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
      {requestedItems.map((item) => {
        const slots = item.preferred_slots?.slots || []
        const theme = item.theme_tags?.[0] || null
        const note = item.preferred_slots?.note || null
        const counterProposed = (item.preferred_slots?.counter_slots?.length || 0) > 0
        const isCounterOpen = counterOpenId === item.id
        const counterInput = counterInputs[item.id] || ['', '', '']
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
              <strong>{item.client_nickname}さん</strong>から紹介予約のリクエストが届いています
              {item.sender_pro?.name && (
                <span style={{ color: '#6B7280' }}>(紹介元: {item.sender_pro.name}さん)</span>
              )}
            </div>
            {theme && <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>テーマ: {theme}</div>}
            {item.menu_name && <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>メニュー: {item.menu_name}</div>}
            {note && <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>補足: {note}</div>}

            {counterProposed ? (
              <>
                <div
                  style={{
                    fontSize: 12,
                    color: '#B26A00',
                    background: '#FFF3E0',
                    borderRadius: 8,
                    padding: '8px 10px',
                    marginBottom: 10,
                  }}
                >
                  別日時を提案済み・クライアントの返答待ちです
                </div>
                <button
                  onClick={() => decline(item.id)}
                  disabled={processingId === item.id}
                  style={{
                    width: '100%',
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
              </>
            ) : (
              <>
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

                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
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

                {!isCounterOpen ? (
                  <button
                    onClick={() => setCounterOpenId(item.id)}
                    style={{
                      width: '100%',
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      color: '#6B7280',
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'underline',
                      cursor: 'pointer',
                    }}
                  >
                    別の日時を提案する
                  </button>
                ) : (
                  <div style={{ marginTop: 6, padding: '10px 12px', background: '#fff', borderRadius: 8, border: '1px solid #D1D5DB' }}>
                    <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>
                      クライアントに別日時を提案します(第1希望は必須)
                    </div>
                    {[0, 1, 2].map((i) => (
                      <div key={i} style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 4 }}>
                          第{i + 1}希望{i > 0 ? '(任意)' : '(必須)'}
                        </label>
                        <input
                          type="datetime-local"
                          value={counterInput[i]}
                          onChange={(e) => {
                            const next: [string, string, string] = [...counterInput] as [string, string, string]
                            next[i] = e.target.value
                            setCounterInputs((prev) => ({ ...prev, [item.id]: next }))
                          }}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 12, boxSizing: 'border-box' }}
                        />
                        {formatSlotWithWeekday(counterInput[i]) && (
                          <div style={{ fontSize: 11, color: '#C4A35A', fontWeight: 600, marginTop: 2 }}>
                            {formatSlotWithWeekday(counterInput[i])}
                          </div>
                        )}
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => submitCounter(item.id)}
                        disabled={processingId === item.id}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: 'none',
                          background: '#1A1A2E',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: processingId === item.id ? 'default' : 'pointer',
                          opacity: processingId === item.id ? 0.6 : 1,
                        }}
                      >
                        この日時を提案する
                      </button>
                      <button
                        onClick={() => setCounterOpenId(null)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid #D1D5DB',
                          background: '#fff',
                          color: '#6B7280',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}

      {proId &&
        confirmedItems.map((item) => {
          // レビューFAIL修正(重大1): counter経由(逆指定)/通常3枠経由の両方に対応し、null安全に
          // 確定日時を表示する。counter_slots優先(存在する場合はそちらが実際に確定した日時)。
          const confirmedSlotIso =
            typeof item.preferred_slots?.confirmed_counter_index === 'number'
              ? item.preferred_slots?.counter_slots?.[item.preferred_slots.confirmed_counter_index] || null
              : typeof item.preferred_slots?.confirmed_index === 'number'
                ? item.preferred_slots?.slots?.[item.preferred_slots.confirmed_index] || null
                : null
          const confirmedSlotText = formatSlot(confirmedSlotIso)
          return (
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
              <strong>{item.client_nickname}さん</strong>との紹介予約が確定しています
              {item.sender_pro?.name && (
                <span style={{ color: '#6B7280' }}>(紹介元: {item.sender_pro.name}さん)</span>
              )}
            </div>
            {confirmedSlotText && (
              <div style={{ fontSize: 12, color: '#2E7D32', fontWeight: 600, marginTop: 4 }}>
                確定日時: {confirmedSlotText}
              </div>
            )}
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
            {/* レビュー指摘(R3): confirm時のCheckout作成失敗フォールバック(unpaid)は自動再試行で
                回復するが、その間の無説明を避ける(連絡先が出ない理由を正直に示す) */}
            {item.payment_status === 'unpaid' && (
              <div
                style={{
                  display: 'inline-block', marginTop: 6, padding: '3px 10px', borderRadius: 999,
                  background: '#F3F4F6', color: '#6B7280', fontSize: 11, fontWeight: 600,
                }}
              >
                お支払いのご案内を準備中です（連絡先はお支払い完了後に表示されます）
              </div>
            )}
            {/* §2-4ステージ3(決済確認後の連絡先開示・CEO決定): 開示条件を満たす場合のみ表示する。
                日程調整・当日連絡はここから直接どうぞ、の案内。 */}
            {item.client_contact && (
              <div
                style={{
                  marginTop: 8,
                  padding: '10px 12px',
                  background: '#fff',
                  border: '1px solid #C8E6C9',
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
          )
        })}

      {/* タスク①(2026-08-04・CEO指示): 支払い期限切れで自動キャンセルされた紹介予約。
          対応不要のお知らせのため、ReferralActionBannerのカウントには含めない(§0-6準拠)。 */}
      {cancelledUnpaidItems.map((item) => {
        const confirmedSlotText = formatSlot(resolveConfirmedSlotIso(item.preferred_slots))
        return (
          <div
            key={item.id}
            style={{
              background: '#F5F5F5',
              border: '1px solid #E0E0E0',
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: 13, color: '#4B4B4B', lineHeight: 1.6 }}>
              <strong>{item.client_nickname}さん</strong>の紹介予約は、期限内にお支払いが確認できなかったためキャンセルされました
            </div>
            {confirmedSlotText && (
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                確定日時: {confirmedSlotText}
              </div>
            )}
            {item.menu_name && (
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>メニュー: {item.menu_name}</div>
            )}
            <button
              onClick={() => dismissCancelled(item.id)}
              disabled={processingId === item.id}
              style={{
                marginTop: 10,
                width: '100%',
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
              閉じる
            </button>
          </div>
        )
      })}

    </div>
  )
}
