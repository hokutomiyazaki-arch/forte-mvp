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
  // CEO指示(2026-08-08)「送り手でクライアントのメールが間違ってる時にはもっと警告で知らせる」:
  // 自分が直す担当(email_fix_owner='sender')のメール未達案件があれば、最上部に赤い警告を出す。
  const [mailFailedCaseId, setMailFailedCaseId] = useState<string | null>(null)
  const [mailFailedCount, setMailFailedCount] = useState(0)
  const [loaded, setLoaded] = useState(false)
  // CEO指示(2026-08-08)「確認したら消える・ステータスが変わったら再度出す」:
  // 「確認する→」を押した時点のバナー内容の署名(案件idとstatusの組)を端末に記憶して非表示にし、
  // 中身が変わったら(新規・ステータス変化)署名が一致しなくなるので自動で再表示する。
  // 赤のメール未達警告は消せない(クリティカル)。
  const [receivedSig, setReceivedSig] = useState('')
  const [sentSig, setSentSig] = useState('')
  const [receivedDismissed, setReceivedDismissed] = useState(false)
  const [sentDismissed, setSentDismissed] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/referral/bookings/received', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      fetch('/api/referral/bookings/sent', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ]).then(([receivedData, sentData]) => {
      const buildSig = (rows: Array<{ id?: string; status: string }>) =>
        rows
          .map((b) => `${b.id || ''}:${b.status}`)
          .sort()
          .join(',')
      if (receivedData?.bookings) {
        const rows = receivedData.bookings as Array<{ id?: string; status: string }>
        const active = rows.filter((b) => b.status === 'requested' || b.status === 'confirmed')
        setRequestedCount(rows.filter((b) => b.status === 'requested').length)
        setConfirmedCount(rows.filter((b) => b.status === 'confirmed').length)
        const sig = buildSig(active)
        setReceivedSig(sig)
        try {
          setReceivedDismissed(window.localStorage.getItem('rp_banner_seen:bookings') === sig)
        } catch { /* localStorage不可なら常に表示 */ }
      }
      if (sentData?.bookings) {
        const rows = sentData.bookings as Array<{
          id?: string
          status: string
          receipt_email_failed?: boolean | null
          email_fix_owner?: 'sender' | 'receiver' | null
        }>
        const active = rows.filter((b) => b.status === 'requested' || b.status === 'confirmed')
        setSentActiveCount(active.length)
        const sig = buildSig(active)
        setSentSig(sig)
        try {
          setSentDismissed(window.localStorage.getItem('rp_banner_seen:cases') === sig)
        } catch { /* localStorage不可なら常に表示 */ }
        const failed = rows.filter((b) => b.receipt_email_failed && b.email_fix_owner === 'sender')
        setMailFailedCount(failed.length)
        setMailFailedCaseId(failed[0]?.id || null)
      }
      setLoaded(true)
    })
  }, [])

  function dismissRow(key: 'bookings' | 'cases', sig: string) {
    try {
      window.localStorage.setItem(`rp_banner_seen:${key}`, sig)
    } catch { /* 保存できなくても遷移自体は続行 */ }
  }

  if (!loaded || (requestedCount === 0 && confirmedCount === 0 && sentActiveCount === 0 && mailFailedCount === 0)) return null

  // レビュー方針: 受け手側の文言が既にある場合はそれを優先し、送り手側は「・」で併記する
  // (2行に分けない・既存文言はsentActiveCount===0の場合は変更しない)。
  // CEO指摘(2026-08-06): §17-1でREALPROOFの直接予約もこの受信箱に届くようになったため、
  // 「紹介予約」と言い切れなくなった。受け手側の文言は「予約」に統一する
  // （送り手側＝自分が紹介した案件は今まで通り「紹介した案件」と呼ぶ。こちらは紹介のままで正しい）。
  // CEO指摘(2026-08-08)「紹介した案件の通知リンクが予約ページにとぶ」→リンク分割
  // →CEO指摘(同日)「上に2つあると邪魔。重い」→ **1つの箱**の中に行として並べる形に再修正。
  // それぞれの行が自分の行き先を持つ(受け手側→予約タブ・送り手側→紹介した案件サブタブ)。
  const rows: Array<{ label: string; href: string; onClick: () => void }> = []
  if ((requestedCount > 0 || confirmedCount > 0) && !receivedDismissed) {
    rows.push({
      label:
        requestedCount > 0
          ? `新しい予約リクエストが${requestedCount}件`
          : `対応中の予約が${confirmedCount}件`,
      href: '/dashboard?tab=bookings',
      onClick: () => dismissRow('bookings', receivedSig),
    })
  }
  if (sentActiveCount > 0 && !sentDismissed) {
    rows.push({
      label: `紹介した案件が${sentActiveCount}件進行中`,
      href: '/dashboard?tab=referral&sub=cases',
      onClick: () => dismissRow('cases', sentSig),
    })
  }
  if (rows.length === 0 && mailFailedCount === 0) return null
  const emphasized = requestedCount > 0

  return (
    <div style={{ marginBottom: 16 }}>
      {/* CEO指示(2026-08-08): メール未達(自分が直す担当)は静かな一覧に混ぜず、赤い警告で最上部に出す */}
      {mailFailedCount > 0 && (
        <a
          href={
            mailFailedCaseId
              ? `/dashboard?tab=referral&sub=cases&case=${encodeURIComponent(mailFailedCaseId)}`
              : '/dashboard?tab=referral&sub=cases'
          }
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', marginBottom: 8, borderRadius: 10,
            background: '#FFF3F3', border: '1.5px solid #E5A0A0',
            textDecoration: 'none',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: '#B00020' }}>
            紹介したお客さまにメールが届いていません（{mailFailedCount}件）。お電話での確認が必要です
          </span>
          <span style={{ fontSize: 12, color: '#B00020', fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>
            対応する →
          </span>
        </a>
      )}
      {rows.length > 0 && (
        <div style={{ background: '#FAFAFA', border: `1px solid ${emphasized ? '#B8D4F0' : '#E5E7EB'}`, borderRadius: 10 }}>
          {rows.map((row, i) => (
            <a
              key={row.href}
              href={row.href}
              onClick={row.onClick}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 14px', textDecoration: 'none',
                borderTop: i > 0 ? '1px solid #EEEEEE' : 'none',
                background: i === 0 && emphasized ? '#F0F7FF' : 'transparent',
                borderRadius: i === 0 ? '10px 10px 0 0' : rows.length - 1 === i ? '0 0 10px 10px' : 0,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>{row.label}</span>
              <span style={{ fontSize: 12, color: '#C4A35A', fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>
                確認する →
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
