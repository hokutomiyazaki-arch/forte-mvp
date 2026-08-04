'use client'

/**
 * バグ報告(2026-08-04・CEO): 決済(Stripe Checkout)を中断すると再開導線が無い問題への対応。
 * /booking/[booking_id](認証不要・秘匿URL)に置く「お支払いに進む」ボタン。
 * POST /api/referral/bookings/[booking_id]/payment-link を叩き、返ってきたcheckout_urlへ遷移する。
 */

import { useState } from 'react'

const T = {
  dark: '#1A1A2E',
  textMuted: '#888888',
}

interface Props {
  bookingId: string
}

export default function PaymentLinkButton({ bookingId }: Props) {
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleClick() {
    if (loading) return
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await fetch(`/api/referral/bookings/${bookingId}/payment-link`, {
        method: 'POST',
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.checkout_url) {
        window.location.href = data.checkout_url
        return
      }
      // レビュー指摘(中4): 409(not_awaiting)を通信・500系の文言と分けて案内する
      if (res.status === 409 && data.error === 'not_awaiting') {
        setErrorMsg(
          data.status === 'paid'
            ? 'お支払いは完了しています。画面を再読み込みしてください。'
            : 'この予約は現在お支払いを受け付けていません。'
        )
        return
      }
      setErrorMsg('リンクの取得に失敗しました。メールのお支払いリンクもご利用いただけます。')
    } catch {
      setErrorMsg('リンクの取得に失敗しました。メールのお支払いリンクもご利用いただけます。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          width: '100%',
          padding: '13px 0',
          borderRadius: 10,
          border: 'none',
          background: loading ? '#E8E4DC' : T.dark,
          color: loading ? T.textMuted : '#fff',
          fontSize: 14,
          fontWeight: 700,
          cursor: loading ? 'default' : 'pointer',
          marginTop: 14,
        }}
      >
        {loading ? '準備中...' : 'お支払いに進む'}
      </button>
      {errorMsg && <p style={{ fontSize: 12, color: '#B00020', marginTop: 10, lineHeight: 1.6 }}>{errorMsg}</p>}
    </div>
  )
}
