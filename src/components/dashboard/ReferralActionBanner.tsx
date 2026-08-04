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
  // CEO追加指示(2026-08-04): 送り手側(自分が紹介した案件)の進行中件数も併記する。
  // 新規APIは作らず、ReferralTabが使う既存の /api/referral/bookings/sent を再利用し、
  // 返ってきた一覧をrequested/confirmedでフィルタしてcountを取るだけにする(重いクエリを増やさない)。
  const [sentActiveCount, setSentActiveCount] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/referral/bookings/received', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      fetch('/api/referral/bookings/sent', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ]).then(([receivedData, sentData]) => {
      if (receivedData?.bookings) {
        const rows = receivedData.bookings as Array<{ status: string }>
        setRequestedCount(rows.filter((b) => b.status === 'requested').length)
        setConfirmedCount(rows.filter((b) => b.status === 'confirmed').length)
      }
      if (sentData?.bookings) {
        const rows = sentData.bookings as Array<{ status: string }>
        setSentActiveCount(rows.filter((b) => b.status === 'requested' || b.status === 'confirmed').length)
      }
      setLoaded(true)
    })
  }, [])

  if (!loaded || (requestedCount === 0 && confirmedCount === 0 && sentActiveCount === 0)) return null

  // レビュー方針: 受け手側の文言が既にある場合はそれを優先し、送り手側は「・」で併記する
  // (2行に分けない・既存文言はsentActiveCount===0の場合は変更しない)。
  let label: string
  if (sentActiveCount === 0) {
    label =
      requestedCount > 0
        ? `新しい紹介予約リクエストが${requestedCount}件あります`
        : `対応中の紹介予約が${confirmedCount}件あります`
  } else if (requestedCount === 0 && confirmedCount === 0) {
    label = `あなたが紹介した案件が${sentActiveCount}件進行中です`
  } else {
    const receivedPart =
      requestedCount > 0
        ? `新しいリクエストが${requestedCount}件`
        : `対応中の紹介予約が${confirmedCount}件`
    label = `${receivedPart}・紹介した案件が${sentActiveCount}件進行中です`
  }

  // CEO指示(2026-08-04・IA再変更): 送り手のみの文言なら新設の「紹介した案件」サブタブへ、
  // 受け手側を含む場合は「受ける」サブタブへ直接着地させる(?sub=receive|casesは
  // dashboard/page.tsx側でlocalStorage/自動判定より優先される)。
  const hasReceivedPart = requestedCount > 0 || confirmedCount > 0
  const href = hasReceivedPart ? '/dashboard?tab=referral&sub=receive' : '/dashboard?tab=referral&sub=cases'

  return (
    <a
      href={href}
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
