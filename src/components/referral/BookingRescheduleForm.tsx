'use client'

/**
 * ライフサイクル改善(タスクB・2026-08-04・CEO指示): 確定後にプロが提案した日時変更の選択UI。
 * 認証不要(秘匿URL=booking_id)。BookingAcceptForm(逆指定・requested時点)と同じ流儀を踏襲する。
 * クライアントの氏名・電話番号・メールアドレスは一切表示しない(第三者閲覧に備える)。
 *
 * CEO指摘(2026-08-04・意味合い変更): 「プロの中立的な提案」から「プロがどうしても確定日時に
 * 都合がつかなくなったための変更のお願い」へ全面変更。「現在の日時のまま」ボタンは残すが、
 * 文言は「候補では難しいためのクライアントからの回答」に変える(keep_current modeはそのまま使う)。
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
  rescheduleSlots: string[]
  currentSlotText: string | null
}

export default function BookingRescheduleForm({ bookingId, receiverProName, rescheduleSlots, currentSlotText }: Props) {
  // レビュー指摘(重大2b): indexではなくslot_iso(ISO文字列)で管理する(保存済み
  // reschedule_slotsとの取得順ズレによる誤確定防止)。
  const [selectedIso, setSelectedIso] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [done, setDone] = useState<'select' | 'keep_current' | null>(null)

  async function submit(mode: 'select' | 'keep_current') {
    if (submitting) return
    if (mode === 'select' && selectedIso === null) return
    setSubmitting(true)
    setErrorMsg('')
    try {
      const res = await fetch(`/api/referral/bookings/${bookingId}/reschedule-respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(mode === 'select' ? { mode, slot_iso: selectedIso } : { mode }),
      })
      if (res.ok) {
        setDone(mode)
      } else {
        const data = await res.json().catch(() => ({}))
        if (data.error === 'already_resolved') {
          setErrorMsg('この日時変更のご提案は既に処理済みです。')
        } else if (data.error === 'not_confirmed') {
          setErrorMsg('この紹介予約は既に処理済みです。')
        } else if (data.error === 'invalid_slot') {
          setErrorMsg('選択した日時が無効です。もう一度お試しください。')
        } else {
          setErrorMsg('処理に失敗しました。もう一度お試しください。')
        }
      }
    } catch {
      setErrorMsg('処理に失敗しました。もう一度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  if (done === 'select') {
    return (
      <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: '24px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: T.dark, marginBottom: 8 }}>新しい日時が確定しました</p>
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8 }}>担当: {receiverProName}さん。当日はよろしくお願いいたします。</p>
      </div>
    )
  }
  if (done === 'keep_current') {
    return (
      <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: '24px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: T.dark, marginBottom: 8 }}>現在の日時のご希望を送信しました</p>
        {currentSlotText && <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8 }}>{currentSlotText}</p>}
        <p style={{ fontSize: 12, color: T.textSub, lineHeight: 1.7, marginTop: 8 }}>{receiverProName}さんからのご連絡をお待ちください。</p>
      </div>
    )
  }

  return (
    <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: '18px 16px' }}>
      <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8, marginBottom: 14 }}>
        {receiverProName}さんの都合により日時変更のお願いが届いています。以下の候補からお選びいただくか、候補では難しい場合は現在の日時のご希望をお伝えください。
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {rescheduleSlots.map((iso, i) => {
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
                border: `1px solid ${selectedIso === iso ? T.gold : T.cardBorder}`,
                borderRadius: 10,
                padding: '10px 12px',
              }}
            >
              <input type="radio" name="reschedule-slot" checked={selectedIso === iso} onChange={() => setSelectedIso(iso)} />
              {label}
            </label>
          )
        })}
      </div>

      {errorMsg && <p style={{ fontSize: 12, color: '#B00020', marginBottom: 10 }}>{errorMsg}</p>}

      <button
        onClick={() => submit('select')}
        disabled={selectedIso === null || submitting}
        style={{
          width: '100%',
          padding: '13px 0',
          borderRadius: 10,
          border: 'none',
          background: selectedIso === null || submitting ? '#E8E4DC' : T.dark,
          color: selectedIso === null || submitting ? T.textMuted : '#fff',
          fontSize: 14,
          fontWeight: 700,
          cursor: selectedIso === null || submitting ? 'default' : 'pointer',
          marginBottom: 8,
        }}
      >
        {submitting ? '処理中...' : 'この日時に変更する'}
      </button>
      <button
        onClick={() => submit('keep_current')}
        disabled={submitting}
        style={{
          width: '100%',
          padding: '11px 0',
          borderRadius: 10,
          border: `1px solid ${T.cardBorder}`,
          background: '#fff',
          color: T.textSub,
          fontSize: 13,
          fontWeight: 600,
          cursor: submitting ? 'default' : 'pointer',
        }}
      >
        候補の日時では難しいため、現在の日時を希望する
      </button>

      <p style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.7, marginTop: 10, textAlign: 'center' }}>
        いずれも難しい場合は、予約成立時のメールに記載のご連絡先へ直接ご相談ください。
      </p>
    </div>
  )
}
