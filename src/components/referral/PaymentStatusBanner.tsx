'use client'

/**
 * §2-4ステージ2 決済(オーソリ)結果バナー(/r/[slug])
 *
 * Stripe Checkoutの success_url / cancel_url から ?payment=success|canceled&session_id=...
 * で戻ってきた際に表示する。sessionIdがある場合はフォールバック検証API
 * (GET /api/referral/bookings/payment-return)を1回呼び、webhookが未処理でも冪等に
 * 予約を確定/失効させる(§2-4ステージ2 タスク3・重大3補完)。
 *
 * canceled(キャンセルURL経由)の場合も同APIを呼ぶ(`intent=cancel`を付与。Checkout Sessionが
 * まだ'open'のままならサーバー側でsessions.expire()してdraft行をcancelled化する)が、表示文言は
 * 常に固定のキャンセル文言のまま(draft方式のため再送信は普通に通る。ユーザーへの不安を煽らない)。
 * successの場合はintentを付けない(万一openでも客の支払い試行を殺さないため、payment-return側は
 * expireせずpending判定のみに留める・軽微指摘)。
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

type ResolvedStatus = 'checking' | 'authorized' | 'pending' | 'canceled'

export default function PaymentStatusBanner({ payment, sessionId }: Props) {
  const [status, setStatus] = useState<ResolvedStatus>(() => {
    if (payment === 'success') return sessionId ? 'checking' : 'pending'
    if (payment === 'canceled') return sessionId ? 'checking' : 'canceled'
    return 'canceled'
  })

  // 依存配列はプリミティブのみ(payment/sessionIdは文字列|null)。1回だけ検証APIを呼ぶ。
  useEffect(() => {
    if ((payment !== 'success' && payment !== 'canceled') || !sessionId) return
    let active = true
    // 軽微指摘: intent=cancelはキャンセル戻りの時だけ付与する(payment-return側でsessions.expire()を
    // 呼ぶかどうかの判定に使う。success戻りでは客の支払い試行を殺さないよう付けない)。
    const intentParam = payment === 'canceled' ? '&intent=cancel' : ''
    fetch(`/api/referral/bookings/payment-return?session_id=${encodeURIComponent(sessionId)}${intentParam}`, {
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return
        setStatus(data.status === 'authorized' || data.status === 'canceled' ? data.status : 'pending')
      })
      .catch(() => {
        if (active) setStatus('pending')
      })
    return () => {
      active = false
    }
  }, [payment, sessionId])

  if (!payment) return null

  // canceled(キャンセルURL経由)は検証結果に関わらず固定文言のまま表示する
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
        決済がキャンセルされました。もう一度お試しください。
      </div>
    )
  }

  const messageMap: Record<ResolvedStatus, string> = {
    checking: '決済結果を確認しています…',
    authorized: 'ご相談を受け付けました。カードのご請求はセッション完了後です。',
    pending: '決済結果を確認中です。しばらくしてから画面を更新してご確認ください。',
    canceled: '決済がキャンセルされました。もう一度お試しください。',
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
        color: status === 'authorized' ? T.dark : T.textSub,
        lineHeight: 1.7,
        textAlign: 'center',
      }}
    >
      {messageMap[status]}
    </div>
  )
}
