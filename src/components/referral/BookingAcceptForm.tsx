'use client'

/**
 * ライフサイクル改善(タスクB・逆指定): クライアントの日時選択ページ(/booking/[booking_id])の
 * インタラクティブ部分。認証不要(秘匿URL=booking_id)。クライアントの氏名・電話番号・
 * メールアドレスは一切表示しない(第三者閲覧に備える)。
 */

import { useState } from 'react'
import { formatSlotWithWeekday } from '@/lib/referral-format'

const T = {
  cardBg: '#FFFFFF',
  cardBorder: '#E8E4DC',
  dark: '#1A1A2E',
  gold: '#C4A35A',
  text: '#2D2D2D',
  textSub: '#555555',
  textMuted: '#888888',
}

interface Props {
  bookingId: string
  receiverProName: string
  counterSlots: string[]
  /**
   * 予約フィー説明不足対応(CEO指示・2026-08-04): 決済対象の予約のみ金額が入る
   * (getBookingCapabilityDataの算出条件に合致しない場合はnull=説明ボックス非表示)。
   */
  feeAmountJpy: number | null
}

export default function BookingAcceptForm({ bookingId, receiverProName, counterSlots, feeAmountJpy }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [done, setDone] = useState(false)

  async function handleAccept() {
    if (selectedIndex === null || submitting) return
    setSubmitting(true)
    setErrorMsg('')
    try {
      const res = await fetch(`/api/referral/bookings/${bookingId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ slot_index: selectedIndex }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        if (data.checkout_url) {
          window.location.href = data.checkout_url
          return
        }
        setDone(true)
      } else if (data.error === 'not_pending') {
        setErrorMsg('この紹介予約は既に処理済みです。')
      } else if (data.error === 'expired') {
        setErrorMsg('この紹介予約は無効になりました。')
      } else {
        setErrorMsg('処理に失敗しました。もう一度お試しください。')
      }
    } catch {
      setErrorMsg('処理に失敗しました。もう一度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div
        style={{
          background: T.cardBg,
          border: `1px solid ${T.cardBorder}`,
          borderRadius: 16,
          padding: '24px 20px',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 700, color: T.dark, marginBottom: 8 }}>紹介予約が確定しました</p>
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8 }}>
          担当: {receiverProName}さん。当日はよろしくお願いいたします。
        </p>
      </div>
    )
  }

  return (
    <div
      style={{
        background: T.cardBg,
        border: `1px solid ${T.cardBorder}`,
        borderRadius: 16,
        padding: '18px 16px',
      }}
    >
      <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8, marginBottom: 14 }}>
        ご希望の日時では難しいため、{receiverProName}さんから別の日時のご提案があります。
        <br />
        ご都合の良い日時をお選びください。48時間以内にご返答がない場合は無効になります。
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {counterSlots.map((iso, i) => {
          const label = formatSlotWithWeekday(iso)
          if (!label) return null
          return (
            <label
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: T.dark,
                cursor: 'pointer',
                border: `1px solid ${selectedIndex === i ? T.gold : T.cardBorder}`,
                borderRadius: 10,
                padding: '10px 12px',
              }}
            >
              <input type="radio" name="counter-slot" checked={selectedIndex === i} onChange={() => setSelectedIndex(i)} />
              {label}
            </label>
          )
        })}
      </div>

      {feeAmountJpy !== null && (
        <div
          style={{
            background: '#FAF8F4',
            border: `1px solid ${T.cardBorder}`,
            borderRadius: 10,
            padding: '12px 14px',
            marginBottom: 14,
          }}
        >
          <p style={{ fontSize: 12, color: T.textSub, lineHeight: 1.8, margin: 0 }}>
            日時を選択するとお支払いのご案内に進みます。
            <br />
            予約の成立には予約金(セッション料金の一部・¥{feeAmountJpy.toLocaleString('ja-JP')})のお支払いが必要です。
            <br />
            総額は変わりません(当日は残額のみのお支払いです)。
            <br />
            {receiverProName}さんの都合でキャンセルとなった場合、予約金は全額返金されます。
            <br />
            クライアント様のご都合によるキャンセルは、セッション開始の72時間前まで全額返金・それ以降は返金いたしかねます。
          </p>
        </div>
      )}

      {errorMsg && <p style={{ fontSize: 12, color: '#B00020', marginBottom: 10 }}>{errorMsg}</p>}

      <button
        onClick={handleAccept}
        disabled={selectedIndex === null || submitting}
        style={{
          width: '100%',
          padding: '13px 0',
          borderRadius: 10,
          border: 'none',
          background: selectedIndex === null || submitting ? '#E8E4DC' : T.dark,
          color: selectedIndex === null || submitting ? T.textMuted : '#fff',
          fontSize: 14,
          fontWeight: 700,
          cursor: selectedIndex === null || submitting ? 'default' : 'pointer',
        }}
      >
        {submitting ? '処理中...' : 'この日時で確定する'}
      </button>
    </div>
  )
}
