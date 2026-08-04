'use client'

import { useEffect, useState } from 'react'

/**
 * CEO指示(2026-08-04): 紹介のやりとりカード(リクエスト受信・確定済み)をダッシュボード
 * トップに全文表示するのをやめ、件数付きの1行リンクだけを出す(操作は紹介タブ内で行う)。
 * §0-6準拠(絵文字なし・静かな導線)。対応が必要なものが無ければ何も表示しない。
 */
export default function ReferralActionBanner() {
  const [requestedCount, setRequestedCount] = useState(0)
  const [confirmedCount, setConfirmedCount] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/referral/bookings/received', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.bookings) {
          const rows = data.bookings as Array<{ status: string }>
          setRequestedCount(rows.filter((b) => b.status === 'requested').length)
          setConfirmedCount(rows.filter((b) => b.status === 'confirmed').length)
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  if (!loaded || (requestedCount === 0 && confirmedCount === 0)) return null

  const label =
    requestedCount > 0
      ? `新しい紹介予約リクエストが${requestedCount}件あります`
      : `対応中の紹介予約が${confirmedCount}件あります`

  return (
    <a
      href="/dashboard?tab=referral"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', marginBottom: 16, borderRadius: 10,
        background: requestedCount > 0 ? '#F0F7FF' : '#FAFAFA',
        border: `1px solid ${requestedCount > 0 ? '#B8D4F0' : '#E5E7EB'}`,
        textDecoration: 'none',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#C4A35A', fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>
        確認する →
      </span>
    </a>
  )
}
