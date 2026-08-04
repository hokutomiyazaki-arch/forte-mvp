'use client'

import { useEffect, useState } from 'react'
import {
  formatSlot,
  formatSlotWithWeekday,
  resolveConfirmedSlotIso,
  isWithinClientRefundDeadline,
} from '@/lib/referral-format'
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
    /** ライフサイクル改善(2026-08-04・タスクB): 確定後にプロが提案した日時変更(最大3枠)。 */
    reschedule_slots?: string[] | null
    /** クライアントが日時変更提案に応答済みか(未回答の間だけ「提案済み」表示にする)。 */
    reschedule_resolved_at?: string | null
    /** クライアントが日時変更提案から選んだ確定ISO(既存のconfirmed_index等より優先)。 */
    confirmed_slot_iso?: string | null
    /** タスク②(2026-08-04・CEO指示): プロ都合キャンセル実行時のマーカー(表示には未使用)。 */
    cancelled_by_receiver_at?: string | null
    /** レビュー指摘(軽微1): 直近ラウンドで「現在の日時を希望する」が選ばれた場合のみ立つマーカー。 */
    reschedule_kept_current_at?: string | null
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
  /** UI再構成(2026-08-04・CEO承認済み): サブタブの件数バッジ・空状態判定用に、要対応(requested)件数と
   * 総件数(requested+confirmed+支払い期限切れキャンセル)・読み込み完了フラグを親へ通知する。
   * データ取得ロジック自体は変更しない(既存fetchの結果を集計して通知するだけ)。 */
  onStatusChange?: (info: { requestedCount: number; totalCount: number; loaded: boolean }) => void
}

/**
 * CEO追加指示(2026-08-04): カード左上に現在ステータスを1つだけ色分けpillで表示する。
 * 文字は13px以上・絵文字なし(§0-6)。
 */
function StatusPill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <div
      style={{
        display: 'inline-block',
        marginBottom: 8,
        padding: '2px 10px',
        borderRadius: 999,
        background: bg,
        color,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  )
}

/**
 * §2-4/§4-8: 受信した予約リクエストの確定・辞退カード。
 * §2-10: 確定済み予約には案件スレッド・引き継ぎメモの開閉式ビューを表示する。
 * ★ isReferralEnabled ではゲートしない(受け手は先行アクセス外でもリクエストを受けられる必要がある)。
 * ダッシュボード上部に、タブに依存せず常時表示する。
 */
export default function ReferralBookingReceivedCard({ proId, onStatusChange }: Props) {
  const [items, setItems] = useState<BookingItem[]>([])
  const [cancelledUnpaidItems, setCancelledUnpaidItems] = useState<CancelledUnpaidItem[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Record<string, number>>({})
  // ライフサイクル改善(タスクA・逆指定): 「別の日時を提案する」の開閉と入力値(bookingIdごと)
  const [counterOpenId, setCounterOpenId] = useState<string | null>(null)
  const [counterInputs, setCounterInputs] = useState<Record<string, [string, string, string]>>({})
  // タスクA(2026-08-04・CEO指示): 「当日の場所を送る」の開閉・入力値・保存チェック・送信済み(セッション内のみ)
  const [locationOpenId, setLocationOpenId] = useState<string | null>(null)
  const [locationInputs, setLocationInputs] = useState<Record<string, string>>({})
  const [locationSaveDefault, setLocationSaveDefault] = useState<Record<string, boolean>>({})
  const [locationSentIds, setLocationSentIds] = useState<Set<string>>(new Set())
  const [receiverAddressSet, setReceiverAddressSet] = useState(false)
  // CEO指摘(2026-08-04): 住所設定済みの場合は「設定済みの場所を成立メールで送付済み」表示に使う実値
  const [receiverAddress, setReceiverAddress] = useState<string | null>(null)
  // タスクB(2026-08-04・CEO指示): 「日時変更を提案する」の開閉と入力値(bookingIdごと)
  const [rescheduleOpenId, setRescheduleOpenId] = useState<string | null>(null)
  const [rescheduleInputs, setRescheduleInputs] = useState<Record<string, [string, string, string]>>({})
  // タスク②(2026-08-04・CEO指示): 「どうしてもキャンセルが必要な場合はこちら」の開閉
  const [cancelOpenId, setCancelOpenId] = useState<string | null>(null)
  // CEO決定(2026-08-04・追加): キャンセルの「どちらの都合か」選択(bookingIdごと・デフォルト'pro')
  const [cancelReasonInputs, setCancelReasonInputs] = useState<Record<string, 'pro' | 'client'>>({})
  // レビュー指摘(重大3): 「クライアントから連絡を受けた日時」の任意入力(bookingIdごと・reason='client'時のみ表示)
  const [clientRequestedAtInputs, setClientRequestedAtInputs] = useState<Record<string, string>>({})
  // レビュー指摘(軽微8): キャンセル成功時、カードが消える前に一時フィードバックを表示するID集合
  const [cancelledFeedbackIds, setCancelledFeedbackIds] = useState<Set<string>>(new Set())
  // UI再構成(2026-08-04・CEO承認済み): 確定済みカードの「変更・キャンセルなどの操作」は
  // 折りたたみメニュー(1件だけ画面に出す原則)。bookingId単位でどの表示状態かを保持する。
  // 'closed'=非表示(トリガーのみ) / 'menu'=3項目の選択メニュー / フォーム自体は既存の
  // locationOpenId/rescheduleOpenId/cancelOpenId(既存state・ロジック不変)で判定する。
  const [opsMenuOpenId, setOpsMenuOpenId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/referral/bookings/received', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.bookings) setItems(data.bookings)
        if (data?.cancelled_unpaid) setCancelledUnpaidItems(data.cancelled_unpaid)
        if (typeof data?.receiver_address_set === 'boolean') setReceiverAddressSet(data.receiver_address_set)
        if (typeof data?.receiver_address === 'string') setReceiverAddress(data.receiver_address)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const requestedItems = items.filter((i) => i.status === 'requested')
  const confirmedItems = items.filter((i) => i.status === 'confirmed')

  // UI再構成(2026-08-04): サブタブの件数バッジ・空状態判定のため、親へ集計結果を通知する。
  // 依存はプリミティブのみ(件数・boolean)。onStatusChange自体はdepsに含めない(既存コードの
  // eslint-disable-next-lineパターンに合わせる)。
  const requestedCount = requestedItems.length
  const totalReceivedCount = items.length + cancelledUnpaidItems.length
  useEffect(() => {
    onStatusChange?.({ requestedCount, totalCount: totalReceivedCount, loaded: !loading })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedCount, totalReceivedCount, loading])

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

  /** タスクA(2026-08-04・CEO指示): 当日の場所をクライアントへ送信する。 */
  async function sendLocation(bookingId: string) {
    const text = (locationInputs[bookingId] || '').trim()
    if (!text) {
      window.alert('場所を入力してください')
      return
    }
    // レビュー指摘(重大1): 「プロフィールの住所として保存する」チェックON時は、公開カードの
    // アクセス欄に表示される旨を送信直前にも確認する。
    if (
      locationSaveDefault[bookingId] &&
      !window.confirm('入力した場所が公開プロフィールに表示されます。よろしいですか？')
    ) {
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
          action: 'send_location',
          location_text: text,
          save_as_default: !!locationSaveDefault[bookingId],
        }),
      })
      if (res.ok) {
        setLocationSentIds((prev) => new Set(prev).add(bookingId))
        setLocationOpenId(null)
        if (locationSaveDefault[bookingId]) setReceiverAddressSet(true)
      } else {
        window.alert('送信に失敗しました')
      }
    } finally {
      setProcessingId(null)
    }
  }

  /** タスクB(2026-08-04・CEO指示): 確定後にプロ都合の日時変更を提案する(第1希望のみ必須)。 */
  async function submitReschedule(bookingId: string) {
    const inputs = rescheduleInputs[bookingId] || ['', '', '']
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
          action: 'reschedule',
          reschedule_slots: [slot1, slot2 || null, slot3 || null].filter(Boolean),
        }),
      })
      if (res.ok) {
        setRescheduleOpenId(null)
        const refreshed = await fetch('/api/referral/bookings/received', { cache: 'no-store' })
        const data = await refreshed.json().catch(() => null)
        if (data?.bookings) setItems(data.bookings)
      } else {
        // レビュー指摘(重大2・中1): 409の理由を専用文言で伝える
        const data = await res.json().catch(() => ({}))
        if (data.error === 'reschedule_already_proposed') {
          window.alert('既に日時変更を提案済みです。クライアントの返答をお待ちください')
        } else if (data.error === 'payment_pending') {
          window.alert('クライアントのお支払いが完了していないため、日時変更を提案できません')
        } else if (data.error === 'invalid_slots') {
          window.alert('未来の日時を入力してください')
        } else {
          window.alert('提案の送信に失敗しました')
        }
      }
    } finally {
      setProcessingId(null)
    }
  }

  /**
   * タスク②(2026-08-04・CEO指示): プロ都合/クライアント都合キャンセル＋自動返金判定。
   * 「どうしてもキャンセルが必要な場合はこちら」を開いた後の「キャンセルする」ボタンから呼ぶ
   * (注意文の表示=1段目、window.confirmでの最終確認=2段目)。理由入力(自由記述)は不要。
   * CEO決定(2026-08-04・追加): reasonで確認文言を分岐する(clientはセッション開始72時間前ルールに言及)。
   */
  async function cancelByReceiver(bookingId: string, reason: 'pro' | 'client') {
    const confirmMessage =
      reason === 'client'
        ? 'クライアントの希望による紹介予約のキャンセルとして処理します。返金の有無はセッション開始72時間前ルールで自動判定されます。この操作は取り消せません。よろしいですか？'
        : 'この紹介予約をキャンセルします。クライアントへ通知が送られ、お支払い済みの予約金は全額返金されます。この操作は取り消せません。よろしいですか？'
    if (!window.confirm(confirmMessage)) {
      return
    }
    setProcessingId(bookingId)
    try {
      // レビュー指摘(重大3): 「クライアントから連絡を受けた日時」(任意入力・reason='client'時のみ)。
      // 未入力・不正値は送らない(サーバー側は未指定=現在時刻を基準にする現状動作にフォールバック)。
      const clientRequestedAtValue = clientRequestedAtInputs[bookingId] || ''
      const clientRequestedAtMs = clientRequestedAtValue ? new Date(clientRequestedAtValue).getTime() : NaN
      const clientRequestedAtIso =
        reason === 'client' && !Number.isNaN(clientRequestedAtMs) ? new Date(clientRequestedAtMs).toISOString() : null

      const res = await fetch('/api/referral/bookings/received', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          booking_id: bookingId,
          action: 'cancel_by_receiver',
          reason,
          ...(clientRequestedAtIso ? { client_requested_at: clientRequestedAtIso } : {}),
        }),
      })
      if (res.ok) {
        setCancelOpenId(null)
        // レビュー指摘(軽微8): カードを即時に消さず、一時フィードバックを見せてから消す。
        setCancelledFeedbackIds((prev) => new Set(prev).add(bookingId))
        setTimeout(() => {
          setItems((prev) => prev.filter((i) => i.id !== bookingId))
          setCancelledFeedbackIds((prev) => {
            const next = new Set(prev)
            next.delete(bookingId)
            return next
          })
        }, 2000)
      } else {
        window.alert('処理に失敗しました')
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
              // CEO追加指示(2026-08-04): カード枠の視認性強化。requestedカードはラベルと同系の
              // オレンジ寄りにして「要対応」が一目で分かるようにする。
              border: '1.5px solid #E8A874',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            <StatusPill label="要対応" bg="#FFE4DE" color="#C2410C" />
            <div style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 1.6, marginBottom: 8 }}>
              <strong>{item.client_nickname}さん</strong>から紹介予約のリクエストが届いています
              {item.sender_pro?.name && (
                <span style={{ color: '#6B7280' }}>(紹介元: {item.sender_pro.name}さん)</span>
              )}
            </div>
            {theme && <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>テーマ: {theme}</div>}
            {item.menu_name && <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>メニュー: {item.menu_name}</div>}
            {note && <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>補足: {note}</div>}

            {counterProposed ? (
              <>
                <div
                  style={{
                    fontSize: 13,
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
                          fontSize: 13,
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
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: 'underline',
                      cursor: 'pointer',
                    }}
                  >
                    別の日時を提案する
                  </button>
                ) : (
                  <div style={{ marginTop: 6, padding: '10px 12px', background: '#fff', borderRadius: 8, border: '1px solid #D1D5DB' }}>
                    <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 8 }}>
                      クライアントに別日時を提案します(第1希望は必須)
                    </div>
                    {[0, 1, 2].map((i) => (
                      <div key={i} style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 13, color: '#6B7280', display: 'block', marginBottom: 4 }}>
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
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13, boxSizing: 'border-box' }}
                        />
                        {formatSlotWithWeekday(counterInput[i]) && (
                          <div style={{ fontSize: 13, color: '#C4A35A', fontWeight: 600, marginTop: 2 }}>
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
                          fontSize: 13,
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
                          fontSize: 13,
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
          // レビューFAIL修正(重大1)踏襲・タスクB拡張: confirmed_slot_iso(日時変更承諾)を最優先し、
          // counter経由(逆指定)/通常3枠経由の順にフォールバックする(共通ロジックはreferral-format.ts)。
          const confirmedSlotIso = resolveConfirmedSlotIso(item.preferred_slots)
          const confirmedSlotText = formatSlot(confirmedSlotIso)
          // レビュー指摘(重大1): 返金プレビューは「予約金が支払済み(paid)」の場合のみ意味を持つ
          // (未払い/決済対象外はそもそも返金する金額が無い)。
          const feePaid = item.payment_status === 'paid'
          const selectedCancelReason = cancelReasonInputs[item.id] || 'pro'
          // レビュー指摘(重大3): 「クライアントから連絡を受けた日時」の入力値をプレビューにも
          // 反映する(サーバー側と同じMath.min(入力値, 現在時刻)を基準時刻にする・中5で単一情報源化)。
          const clientRequestedAtInputValue = clientRequestedAtInputs[item.id] || ''
          const clientRequestedAtInputMs = clientRequestedAtInputValue ? new Date(clientRequestedAtInputValue).getTime() : NaN
          const cancelPreviewBaseMs = !Number.isNaN(clientRequestedAtInputMs)
            ? Math.min(clientRequestedAtInputMs, Date.now())
            : Date.now()
          const clientCancelWithinDeadline = isWithinClientRefundDeadline(confirmedSlotIso, cancelPreviewBaseMs)
          const rescheduleProposed =
            (item.preferred_slots?.reschedule_slots?.length || 0) > 0 && !item.preferred_slots?.reschedule_resolved_at
          // レビュー指摘(軽微1): confirmed_slot_isoは他ラウンドでも残るため、単独では2周目以降の
          // 判別に使えない(偽陰性の原因)。reschedule_kept_current_at専用マーカーで判別する
          // (reschedule-respond側で解決の都度セット/nullで明示的に上書きされる)。
          const clientKeptCurrentSlot = !!item.preferred_slots?.reschedule_kept_current_at
          const isLocationOpen = locationOpenId === item.id
          const isRescheduleOpen = rescheduleOpenId === item.id
          const rescheduleInput = rescheduleInputs[item.id] || ['', '', '']

          // レビュー指摘(軽微8): キャンセル成功直後は、カードが消える前に一時フィードバックのみ表示する。
          if (cancelledFeedbackIds.has(item.id)) {
            return (
              <div
                key={item.id}
                style={{
                  background: '#F5F5F5',
                  border: '1.5px solid #C5CBD3',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                  borderRadius: 12,
                  padding: '14px 16px',
                }}
              >
                <StatusPill label="キャンセル" bg="#F1F5F9" color="#64748B" />
                <div style={{ fontSize: 13, color: '#4B4B4B', lineHeight: 1.6 }}>
                  キャンセルしました。返金がある場合は手続き済みです。
                </div>
              </div>
            )
          }

          const isMenuOpen = opsMenuOpenId === item.id
          const isFormOpen = isLocationOpen || isRescheduleOpen || cancelOpenId === item.id
          return (
          <div
            key={item.id}
            style={{
              background: '#F9FFF9',
              border: '1.5px solid #8FCB9F',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            {/* CEO追加指示(2026-08-04): 現在ステータスを1つだけ左上に表示(優先順位: 支払い待ち >
                日時変更の返答待ち > 確定済み)。 */}
            {item.payment_status === 'awaiting' ? (
              <StatusPill label="お支払い待ち" bg="#FFF3E0" color="#B26A00" />
            ) : rescheduleProposed ? (
              <StatusPill label="日時変更の返答待ち" bg="#FEF9C3" color="#946800" />
            ) : (
              <StatusPill label="確定済み" bg="#DCFCE7" color="#166534" />
            )}

            {/* 1. クライアント名(+紹介元) */}
            <div style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 1.6 }}>
              <strong>{item.client_nickname}さん</strong>との紹介予約が確定しています
              {item.sender_pro?.name && (
                <span style={{ color: '#6B7280' }}>(紹介元: {item.sender_pro.name}さん)</span>
              )}
            </div>

            {/* 2. 確定日時(CEO承認済みモック: 一番大きく・太字) */}
            {confirmedSlotText && (
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1A6B3C', marginTop: 6, lineHeight: 1.4 }}>
                {confirmedSlotText}
              </div>
            )}

            {/* 3. 状態バッジ(あるときだけ) */}
            {/* §2-4ステージ3(予約フィー方式): 決済リンク送付済み・未払いの間は完了ボタンをdisabled
                にする(レビュー指摘・重大2: フィー未収のまま完了させない)。金額・連絡先は出さない。
                CEO追加指示(2026-08-04): 「クライアントのお支払い待ち」バッジは左上ステータスpillと
                重複するため本文側から削除(説明文「お支払い完了後に完了できます」は残す)。 */}
            {/* レビュー指摘(R3): confirm時のCheckout作成失敗フォールバック(unpaid)は自動再試行で
                回復するが、その間の無説明を避ける(連絡先が出ない理由を正直に示す)。
                レビュー指摘(軽微6): 13px化でpill(borderRadius:999)が2行折返しで崩れるため、
                rescheduleProposedバナーと同じ箱形式に変更。 */}
            {item.payment_status === 'unpaid' && (
              <div
                style={{
                  display: 'block', marginTop: 8, padding: '8px 10px', borderRadius: 8,
                  background: '#F3F4F6', color: '#6B7280', fontSize: 13, fontWeight: 600,
                }}
              >
                お支払いのご案内を準備中です（連絡先はお支払い完了後に表示されます）
              </div>
            )}
            {rescheduleProposed && (
              <div
                style={{
                  fontSize: 13,
                  color: '#B26A00',
                  background: '#FFF3E0',
                  borderRadius: 8,
                  padding: '8px 10px',
                  marginTop: 8,
                }}
              >
                日時変更を提案済み・クライアントの返答待ちです
              </div>
            )}
            {clientKeptCurrentSlot && (
              <div
                style={{
                  fontSize: 13,
                  color: '#1A6B3C',
                  background: '#F0FFF4',
                  borderRadius: 8,
                  padding: '8px 10px',
                  marginTop: 8,
                }}
              >
                クライアントは現在の日時を希望しています
              </div>
            )}
            {locationSentIds.has(item.id) && (
              <div style={{ fontSize: 13, color: '#2E7D32', background: '#F0FFF4', borderRadius: 8, padding: '8px 10px', marginTop: 8 }}>
                場所を送信しました
              </div>
            )}

            {/* 4. クライアント連絡先(開示条件を満たす場合・既存のまま) + 完了ボタン */}
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
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A2E', marginBottom: 4 }}>
                  クライアント連絡先
                </div>
                {item.client_contact.name && (
                  <div style={{ fontSize: 13, color: '#1A1A2E' }}>{item.client_contact.name}さん</div>
                )}
                {item.client_contact.phone && (
                  <div style={{ fontSize: 13, color: '#1A1A2E' }}>
                    電話:{' '}
                    <a href={`tel:${encodeURIComponent(item.client_contact.phone)}`} style={{ color: '#1A6B3C' }}>
                      {item.client_contact.phone}
                    </a>
                  </div>
                )}
                {item.client_contact.email && (
                  <div style={{ fontSize: 13, color: '#1A1A2E' }}>
                    メール:{' '}
                    <a href={`mailto:${encodeURIComponent(item.client_contact.email)}`} style={{ color: '#1A6B3C' }}>
                      {item.client_contact.email}
                    </a>
                  </div>
                )}
                <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
                  日程の調整・当日のご連絡はこちらへ直接どうぞ
                </div>
              </div>
            )}

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
            {/* レビュー指摘(軽微5): cronの実条件(確定日時+24h・awaiting除外・reschedule未回答の間は
                対象外)と一致させる。文言も「確定日時から24時間」に修正。 */}
            {item.payment_status !== 'awaiting' && !rescheduleProposed && (
              <p style={{ marginTop: 4, fontSize: 13, color: '#9CA3AF' }}>
                確定日時から24時間を過ぎると自動で完了されます
              </p>
            )}
            {item.payment_status === 'awaiting' && (
              <p style={{ marginTop: 4, fontSize: 13, color: '#B26A00' }}>
                クライアントのお支払い完了後に完了できます
              </p>
            )}

            {/* 案件スレッド・引き継ぎメモ(開閉は既存のまま) */}
            <BookingThread
              bookingId={item.id}
              ownProId={proId}
              isSender={false}
              initialHandoverNote={item.handover_note}
            />

            {/* 例外操作: 「変更・キャンセルなどの操作 ▼」に集約。一度に1つのことだけ画面に出す原則
                (フォームを開いたらそのフォームだけ表示・戻るで一覧に戻れる)。
                機能・API呼び出し・ガード条件は既存のまま(locationOpenId/rescheduleOpenId/cancelOpenId
                及び各handlerを変更していない)。 */}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #E5E7EB' }}>
              {!isMenuOpen && !isFormOpen && (
                <button
                  onClick={() => setOpsMenuOpenId(item.id)}
                  style={{
                    background: 'transparent', border: 'none', color: '#6B7280',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0,
                  }}
                >
                  変更・キャンセルなどの操作 ▼
                </button>
              )}

              {isMenuOpen && !isFormOpen && (
                <div>
                  <button
                    onClick={() => setOpsMenuOpenId(null)}
                    style={{
                      background: 'transparent', border: 'none', color: '#6B7280',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 10,
                    }}
                  >
                    変更・キャンセルなどの操作 ▲
                  </button>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                    {/* タスクA(2026-08-04・CEO指示): 当日の場所を送る(住所設定済み案内含む)。
                        確定済み・支払い待ちでないカードのみ。
                        レビュー指摘(中4): 再配置で送信済みガードが外れ何度でも再送できる状態に
                        なっていたため復元する(送信済みは上部バッジ表示のみでよい)。 */}
                    {item.payment_status !== 'awaiting' && !locationSentIds.has(item.id) && (
                      receiverAddressSet ? (
                        // CEO指摘(2026-08-04): 住所設定済みのプロは成立メールで場所を自動送付済みのため、
                        // 「当日の場所を送る」ボタンではなく送付済みの案内を表示する(別の場所を送る導線は小さく残す)
                        <div style={{ fontSize: 13, color: '#6B7280', background: '#F9FAFB', borderRadius: 8, padding: '8px 10px' }}>
                          設定済みの場所（{receiverAddress}）は予約成立時のメールでクライアントへお送りしています。
                          <button
                            onClick={() => setLocationOpenId(item.id)}
                            style={{
                              display: 'block', marginTop: 4, padding: 0, border: 'none',
                              background: 'transparent', color: '#6B7280', fontSize: 13,
                              textDecoration: 'underline', cursor: 'pointer',
                            }}
                          >
                            別の場所を送る
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setLocationOpenId(item.id)}
                          style={{
                            width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB',
                            background: '#fff', color: '#1A1A2E', fontSize: 13, fontWeight: 600,
                            textAlign: 'left' as const, cursor: 'pointer',
                          }}
                        >
                          当日の場所を送る
                        </button>
                      )
                    )}

                    {/* タスクB(2026-08-04・CEO指示): 確定後にプロ都合の日時変更を提案する(キャンセル前段)。
                        レビュー指摘(中1): フィー未払い(awaiting)の間は提案ボタンごと非表示にする。 */}
                    {!rescheduleProposed && item.payment_status !== 'awaiting' && (
                      <button
                        onClick={() => setRescheduleOpenId(item.id)}
                        style={{
                          width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB',
                          background: '#fff', color: '#1A1A2E', fontSize: 13, fontWeight: 600,
                          textAlign: 'left' as const, cursor: 'pointer',
                        }}
                      >
                        日時の変更をお願いする
                      </button>
                    )}

                    {/* タスク②(2026-08-04・CEO指示): プロ都合キャンセル＋自動返金。控えめなテキストリンクで、
                        誤操作を避ける(理由入力は不要。二段確認=注意文パネル+window.confirm)。 */}
                    <button
                      onClick={() => setCancelOpenId(item.id)}
                      style={{
                        background: 'transparent', border: 'none', color: '#9CA3AF',
                        fontSize: 13, textDecoration: 'underline', cursor: 'pointer', padding: 0,
                        textAlign: 'left' as const,
                      }}
                    >
                      どうしてもキャンセルが必要な場合はこちら
                    </button>
                  </div>
                </div>
              )}

              {isLocationOpen && (
                <div style={{ padding: '10px 12px', background: '#fff', borderRadius: 8, border: '1px solid #D1D5DB' }}>
                  <label style={{ fontSize: 13, color: '#6B7280', display: 'block', marginBottom: 4 }}>
                    当日の場所(1〜2行程度)
                  </label>
                  <textarea
                    value={locationInputs[item.id] || ''}
                    onChange={(e) => setLocationInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    rows={2}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
                  />
                  {!receiverAddressSet && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6B7280', marginTop: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!locationSaveDefault[item.id]}
                        onChange={(e) => setLocationSaveDefault((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                      />
                      プロフィールの住所として保存する（公開カードのアクセス欄に表示されます）
                    </label>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() => sendLocation(item.id)}
                      disabled={processingId === item.id}
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
                        background: '#1A1A2E', color: '#fff', fontSize: 13, fontWeight: 600,
                        cursor: processingId === item.id ? 'default' : 'pointer',
                        opacity: processingId === item.id ? 0.6 : 1,
                      }}
                    >
                      送信する
                    </button>
                    <button
                      onClick={() => setLocationOpenId(null)}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >
                      ← 一覧に戻る
                    </button>
                  </div>
                </div>
              )}

              {isRescheduleOpen && (
                <div style={{ padding: '10px 12px', background: '#fff', borderRadius: 8, border: '1px solid #D1D5DB' }}>
                  <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 8 }}>
                    確定した日時にどうしても都合がつかなくなった場合に、クライアントへ新しい日時をお願いします(第1希望は必須)。クライアントには「あなたの都合による変更のお願い」として届きます。
                  </div>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 13, color: '#6B7280', display: 'block', marginBottom: 4 }}>
                        第{i + 1}希望{i > 0 ? '(任意)' : '(必須)'}
                      </label>
                      <input
                        type="datetime-local"
                        value={rescheduleInput[i]}
                        onChange={(e) => {
                          const next: [string, string, string] = [...rescheduleInput] as [string, string, string]
                          next[i] = e.target.value
                          setRescheduleInputs((prev) => ({ ...prev, [item.id]: next }))
                        }}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13, boxSizing: 'border-box' }}
                      />
                      {formatSlotWithWeekday(rescheduleInput[i]) && (
                        <div style={{ fontSize: 13, color: '#C4A35A', fontWeight: 600, marginTop: 2 }}>
                          {formatSlotWithWeekday(rescheduleInput[i])}
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => submitReschedule(item.id)}
                      disabled={processingId === item.id}
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
                        background: '#1A1A2E', color: '#fff', fontSize: 13, fontWeight: 600,
                        cursor: processingId === item.id ? 'default' : 'pointer',
                        opacity: processingId === item.id ? 0.6 : 1,
                      }}
                    >
                      この日時変更を提案する
                    </button>
                    <button
                      onClick={() => setRescheduleOpenId(null)}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >
                      ← 一覧に戻る
                    </button>
                  </div>
                </div>
              )}

              {cancelOpenId === item.id && (
                <div
                  style={{
                    padding: '10px 12px',
                    background: '#FFF5F5',
                    borderRadius: 8,
                    border: '1px solid #F5C6CB',
                  }}
                >
                  <p style={{ fontSize: 13, color: '#B00020', lineHeight: 1.6, margin: '0 0 8px 0' }}>
                    クライアントへキャンセルの通知が送られます。この操作は取り消せません。
                  </p>

                  {/* CEO決定(2026-08-04・追加): どちらの都合によるキャンセルかを選択する。 */}
                  <div style={{ marginBottom: 8 }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 13,
                        color: '#333',
                        marginBottom: 4,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name={`cancel-reason-${item.id}`}
                        checked={selectedCancelReason === 'pro'}
                        onChange={() => setCancelReasonInputs((prev) => ({ ...prev, [item.id]: 'pro' }))}
                      />
                      {/* レビュー指摘(重大1): 「(全額返金)」ラベルはpaymentが実際にpaidの場合のみ付与する。 */}
                      自分(プロ)の都合でキャンセル{feePaid ? '(全額返金)' : ''}
                    </label>
                    <label
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#333', cursor: 'pointer' }}
                    >
                      <input
                        type="radio"
                        name={`cancel-reason-${item.id}`}
                        checked={selectedCancelReason === 'client'}
                        onChange={() => setCancelReasonInputs((prev) => ({ ...prev, [item.id]: 'client' }))}
                      />
                      クライアントの希望によるキャンセル
                    </label>
                  </div>

                  {selectedCancelReason === 'client' && (
                    <>
                      {/* レビュー指摘(重大3): クライアントから連絡を受けた日時(任意)。72時間前ルールの
                          基準時刻として、現在時刻より前ならこちらを優先する(サーバー側もMath.minで同じ)。 */}
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 13, color: '#6B7280', display: 'block', marginBottom: 4 }}>
                          クライアントから連絡を受けた日時(任意)
                        </label>
                        <input
                          type="datetime-local"
                          value={clientRequestedAtInputValue}
                          onChange={(e) =>
                            setClientRequestedAtInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: 6,
                            border: '1px solid #D1D5DB',
                            fontSize: 13,
                            boxSizing: 'border-box' as const,
                          }}
                        />
                        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4, lineHeight: 1.5 }}>
                          セッション開始の72時間前までにご連絡を受けていた場合は、受けた日時を入力すると
                          全額返金の対象になります。
                        </p>
                      </div>

                      {feePaid ? (
                        <p
                          style={{
                            fontSize: 13,
                            color: clientCancelWithinDeadline ? '#1A6B3C' : '#B00020',
                            background: '#fff',
                            borderRadius: 6,
                            padding: '6px 8px',
                            marginBottom: 8,
                          }}
                        >
                          現時点でキャンセルした場合:{' '}
                          {clientCancelWithinDeadline
                            ? '全額返金されます'
                            : '返金はありません(セッション開始72時間前を過ぎているため)'}
                        </p>
                      ) : (
                        <p
                          style={{
                            fontSize: 13,
                            color: '#6B7280',
                            background: '#fff',
                            borderRadius: 6,
                            padding: '6px 8px',
                            marginBottom: 8,
                          }}
                        >
                          予約金のお支払いがないため返金は発生しません。
                        </p>
                      )}
                    </>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => cancelByReceiver(item.id, selectedCancelReason)}
                      disabled={processingId === item.id}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#B00020',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: processingId === item.id ? 'default' : 'pointer',
                        opacity: processingId === item.id ? 0.6 : 1,
                      }}
                    >
                      キャンセルする
                    </button>
                    <button
                      onClick={() => setCancelOpenId(null)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid #D1D5DB',
                        background: '#fff',
                        color: '#6B7280',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ← 一覧に戻る
                    </button>
                  </div>
                </div>
              )}
            </div>
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
              border: '1.5px solid #C5CBD3',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            <StatusPill label="キャンセル" bg="#F1F5F9" color="#64748B" />
            <div style={{ fontSize: 13, color: '#4B4B4B', lineHeight: 1.6 }}>
              <strong>{item.client_nickname}さん</strong>の紹介予約は、期限内にお支払いが確認できなかったためキャンセルされました
            </div>
            {confirmedSlotText && (
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
                確定日時: {confirmedSlotText}
              </div>
            )}
            {item.menu_name && (
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>メニュー: {item.menu_name}</div>
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
