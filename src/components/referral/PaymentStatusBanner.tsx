'use client'

/**
 * §2-4ステージ3(予約フィー方式)決済結果バナー(/r/[slug])
 *
 * 決済(予約フィー)は受け手プロが日時を確定した後、メールの決済リンク(Stripe Checkout)経由で
 * 発生する。success_url / cancel_url は「実装が軽い方」として/r/[slug]ページを再利用しており
 * (専用ランディングページは新設していない)、クライアントが支払い完了後にここへ戻ってくる。
 * ?payment=success&session_id=... で戻ってきた場合のみフォールバック検証API
 * (GET /api/referral/bookings/payment-return)を1回呼び、webhookが未処理でも冪等に
 * 予約成立を反映する。
 *
 * canceled(キャンセルURL経由)の場合は検証APIを呼ばない固定文言のみ表示する(予約フィー方式では
 * 閉じるべきdraft行が存在しないため、支払いを再開したい場合は同じメールのリンクからやり直せる)。
 */

import { useEffect, useState } from 'react'

const T = {
  cardBg: '#FFFFFF',
  cardBorder: '#E8E4DC',
  dark: '#1A1A2E',
  text: '#2D2D2D',
  textSub: '#555555',
}

interface Props {
  payment: 'success' | 'canceled' | null
  sessionId: string | null
}

type ResolvedStatus = 'checking' | 'paid' | 'pending'

export default function PaymentStatusBanner({ payment, sessionId }: Props) {
  const [status, setStatus] = useState<ResolvedStatus>(() =>
    payment === 'success' && sessionId ? 'checking' : 'pending'
  )

  // 依存配列はプリミティブのみ(payment/sessionIdは文字列|null)。1回だけ検証APIを呼ぶ。
  useEffect(() => {
    if (payment !== 'success' || !sessionId) return
    let active = true
    fetch(`/api/referral/bookings/payment-return?session_id=${encodeURIComponent(sessionId)}`, {
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return
        setStatus(data.status === 'paid' ? 'paid' : 'pending')
      })
      .catch(() => {
        if (active) setStatus('pending')
      })
    return () => {
      active = false
    }
  }, [payment, sessionId])

  if (!payment) return null

  // canceled(キャンセルURL経由)は検証を行わず固定文言のまま表示する
  if (payment === 'canceled') {
    return (
      <div
        style={{
          background: T.cardBg,
          border: `1px solid ${T.cardBorder}`,
          borderRadius: 16,
          padding: '16px',
          marginBottom: 16,
          fontSize: 13,
          color: T.textSub,
          lineHeight: 1.7,
          textAlign: 'center',
        }}
      >
        決済がキャンセルされました。お支払いのご案内メールのリンクからもう一度お試しください。
      </div>
    )
  }

  const messageMap: Record<ResolvedStatus, string> = {
    checking: '決済結果を確認しています…',
    paid: 'お支払いが完了し、予約が成立しました。',
    pending: '決済結果を確認中です。しばらくしてから画面を更新してご確認ください。',
  }

  return (
    <div
      style={{
        background: T.cardBg,
        border: `1px solid ${T.cardBorder}`,
        borderRadius: 16,
        padding: '16px',
        marginBottom: 16,
        fontSize: 13,
        color: status === 'paid' ? T.dark : T.textSub,
        lineHeight: 1.7,
        textAlign: 'center',
      }}
    >
      {messageMap[status]}
    </div>
  )
}
