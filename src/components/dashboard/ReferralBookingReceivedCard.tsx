'use client'

import { useEffect, useState } from 'react'
import {
  formatSlot,
  resolveConfirmedSlotIso,
  isWithinClientRefundDeadline,
  buildGoogleCalendarUrl,
  snapToHalfHourUp,
  isPastDatetimeLocalValue,
  buildHalfHourTimeOptions,
  REFERRAL_FEE_TOTAL_BPS,
} from '@/lib/referral-format'
import BookingThread from '@/components/dashboard/BookingThread'
// §16-41修正6(レビュー指摘・中8): クライアントへの記録依頼パネルの共通コンポーネント
// (ReferralBookingReceivedCard/ReferralCompletedListの丸コピーを解消)。
import ProofRequestPanel from '@/components/dashboard/ProofRequestPanel'
// カード化(2026-08-05・CEO指示): クライアント向けフォームと同じSlotCardGroup(第1〜第3希望の
// 独立カード+段階的追加)を共有する(datetime-local廃止・Android実機でのstep無視崩壊対策)。
import SlotCardGroup from '@/components/referral/SlotCardGroup'
// §17-4: 電話で決めた日時を1枠だけ選ぶのに使う（希望日時3枠のカード群と同じピッカー）。
import SlotPicker from '@/components/referral/SlotPicker'

/** 日時ピッカー設計最終版: プロ側counter/reschedule共通の時刻選択肢(06:00〜23:30の全域)。 */
const PRO_SLOT_TIME_OPTIONS = buildHalfHourTimeOptions('06:00', '24:00')

/**
 * タスクA(2026-08-05・CEO指示・再設計): 受け手が「当日クライアントから受け取る金額」を算出する。
 * 予約金が発生する予約(payment_status が unpaid/awaiting/paid)は、セッション料金から紹介フィーを
 * 引いた当日受領額+内訳を返す。'unpaid'はrequestedカード(確定前・まだ決済リンク未発行)の実際の値であり、
 * 確定すれば必ず紹介フィーが発生するため「発生している予約」に含める(confirmedカードでは
 * 'awaiting'/'paid'に進む)。not_required/null(紹介フィーなし・全額当日受領)はセッション料金
 * そのものを返す。fee_total_bpsは単一情報源(referral-format.ts の REFERRAL_FEE_TOTAL_BPS)へ
 * フォールバックする(レビュー指摘・中4: 3360のハードコード二重管理を解消)。
 * CEO決定(2026-08-05): 受け手プロ向け画面では「予約金」ではなく「紹介フィー」と呼ぶ(クライアント向けの
 * 「予約金」表記・送り手向けの「紹介報酬」表記はここでは変更しない・対象は受け手画面のみ)。
 */
interface ReceiverTodayAmount {
  amountJpy: number
  breakdownText: string
}
function computeReceiverTodayAmount(priceJpy: number, feeTotalBps: number | null | undefined, paymentStatus: string | null | undefined): ReceiverTodayAmount | null {
  if (!priceJpy || priceJpy <= 0) return null
  const hasDeposit = paymentStatus === 'unpaid' || paymentStatus === 'awaiting' || paymentStatus === 'paid'
  if (!hasDeposit) {
    return { amountJpy: priceJpy, breakdownText: 'セッション料金の全額です' }
  }
  const feeAmountJpy = Math.floor((priceJpy * (feeTotalBps ?? REFERRAL_FEE_TOTAL_BPS)) / 10000)
  if (feeAmountJpy <= 0) {
    return { amountJpy: priceJpy, breakdownText: 'セッション料金の全額です' }
  }
  return {
    amountJpy: priceJpy - feeAmountJpy,
    breakdownText: `セッション料金 ¥${priceJpy.toLocaleString('ja-JP')} − 紹介フィー ¥${feeAmountJpy.toLocaleString('ja-JP')}(クライアントが予約金として支払い済み)`,
  }
}

/**
 * CEO指示(2026-08-05・再設計): 当日受取額を1行圧縮ではなく小ブロック化して表示する共通コンポーネント。
 * ①ラベル(13px灰) ②金額(20px太字濃色・主役) ③内訳(13px灰) ④安心の一文(13px・「もらっていいの？」の
 * 不安を潰す固定文言)。requested/confirmed両カードで共有する。
 */
function ReceiverTodayAmountBlock({ amount }: { amount: ReceiverTodayAmount }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 13, color: '#6B7280' }}>当日クライアントから受け取る金額</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#1A1A2E', marginTop: 2 }}>
        ¥{amount.amountJpy.toLocaleString('ja-JP')}
      </div>
      <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{amount.breakdownText}</div>
      <div style={{ fontSize: 13, color: '#1A6B3C', fontWeight: 600, marginTop: 4, lineHeight: 1.6 }}>
        この金額はそのまま全額あなたの受け取りです。REAL PROOFへのお支払いや後日の差し引きはありません。
      </div>
    </div>
  )
}

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
    /**
     * CEO指摘(2026-08-06): 受付メールがクライアントへ送れなかった印。
     * メールアドレスの打ち間違いだと、お客さんには何も届かないのにプロには予約が入る。
     * この場合は電話で連絡してもらう（電話番号は予約フォームの必須項目）。
     */
    receipt_email_failed?: boolean | null
    /** §17-16: 印が立った時刻。誰が直すか(送り手→受け手のフォールバック)の判定に使う。 */
    receipt_email_failed_at?: string | null
    /** §17-19: SMSで本人に届いた印。立っている間はプロ側の対応ブロックを出さない。 */
    contact_recovered_by_sms_at?: string | null
    /** §17-4: 電話で口頭で決めた日時をプロが確定した時刻（お客さん側の同意記録が無い確定） */
    confirmed_by_phone_at?: string | null
  } | null
  /** §16-41: クライアントへの記録依頼(受け手が任意送信)を最後に送った時刻。未送信はnull。 */
  proof_request_sent_at?: string | null
  /** §16-41: 送信済み回数(最大2)。 */
  proof_request_count?: number
  /** §16-41: 依頼したトークンで記録(投票)が完了しているか。 */
  proof_recorded?: boolean
  status: 'requested' | 'confirmed'
  price_jpy: number
  /** タスクA(2026-08-05・CEO指示): 「当日クライアントから受け取る金額」計算用(migration 032由来)。 */
  fee_total_bps?: number | null
  /** §2-4ステージ3(予約フィー方式): 決済有効時のみ入る。金額は含まれない(status相当のみ)。 */
  payment_status?: string | null
  handover_note: { theme?: string; history?: string; tried?: string; notes?: string } | null
  expires_at: string | null
  confirmed_at: string | null
  created_at: string
  client_nickname: string
  sender_pro: { id: string; name: string } | null
  /**
   * §17-1(CEO決定 2026-08-06): 'direct'=REALPROOFの直接予約(紹介元なし・予約金なし)。
   * null=従来の紹介予約。文言（紹介予約 / 予約）の出し分けだけに使う。
   */
  source?: string | null
  /** §2-4ステージ3(決済確認後の連絡先開示・CEO決定): 開示条件を満たす場合のみAPIから入る。 */
  /** §17-6: メールアドレスは返ってこない（表示もしない）。§17-9: メール未達なら確定前でも入る。 */
  client_contact: { name: string | null; phone: string | null } | null
  /**
   * §17-16(CEO指示 2026-08-06): メールが届かなかったとき、いま直す担当が誰か。
   * 'sender' = 紹介元が対応中（受け手の画面には状況だけ出し、操作は出さない）
   * 'receiver' = 自分（直接予約、または紹介元が24時間動かなかった場合）
   * null = メールは届いている（この一連のUIは出さない）
   */
  email_fix_owner?: 'sender' | 'receiver' | null
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
  /** §17-31(CEO指示 2026-08-08): 通知メールの ?booking=<id> から渡ってくる。一覧の読み込み完了後、
   * 該当カードへ自動スクロールし数秒ハイライトする(見つからなければ何もしない)。 */
  highlightBookingId?: string | null
  /** CEO指示(2026-08-08): &thread=1 なら該当カードの案件スレッドまで自動で開く。 */
  highlightThreadOpen?: boolean
  /** §16-41修正A(CEOフィードバック 2026-08-08): 「完了する」成功後に呼ぶ。親が完了済みサブタブへ
   * 切り替え、当該予約を完了済み一覧側で自動展開＋ハイライトするために使う。 */
  onCompleted?: (bookingId: string) => void
}

/**
 * CEO指示(2026-08-08): 予約カードは折りたたみが既定。開閉インジケータ(絵文字なし・SVG)。
 */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M4 6 l4 4 4 -4" stroke="#9CA3AF" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
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
export default function ReferralBookingReceivedCard({ proId, onStatusChange, highlightBookingId, highlightThreadOpen, onCompleted }: Props) {
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
  // §17-4(CEO指示 2026-08-06): 電話で口頭で決まった予約をプロ側から確定する。
  // 「メールが届かないお客さん」への逃げ道なので、開閉と入力値だけを持つ(bookingIdごと)。
  const [phoneConfirmOpenId, setPhoneConfirmOpenId] = useState<string | null>(null)
  const [phoneConfirmInputs, setPhoneConfirmInputs] = useState<Record<string, string>>({})
  // §17-10(CEO指示 2026-08-06): 電話で確認した正しいメールアドレスに直して送り直す。
  const [emailFixOpenId, setEmailFixOpenId] = useState<string | null>(null)
  const [emailFixInputs, setEmailFixInputs] = useState<Record<string, string>>({})

  /**
   * §17-1(CEO決定 2026-08-06): この予約がREALPROOFの直接予約か。
   * 確認ダイアログの文言だけに使う（紹介元がいないのに「紹介予約」と書くと意味が通らない）。
   * ハンドラはbookingIdしか受け取らないため、state から引く。
   */
  function isDirectBooking(bookingId: string): boolean {
    return items.some((i) => i.id === bookingId && i.source === 'direct')
  }

  /**
   * §17-10 メールアドレスを直して送り直す（CEO指示 2026-08-06）。
   * 紹介予約では予約金の支払い案内が届かないと予約自体が成立しない。
   * 電話で正しいアドレスを聞いてから直してもらう前提のUI。
   */
  async function fixClientEmail(bookingId: string) {
    const value = (emailFixInputs[bookingId] || '').trim()
    if (!value || processingId) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      window.alert('メールアドレスの形式をご確認ください')
      return
    }
    if (!window.confirm(
      `${value}\n\nこのメールアドレスに変更して、ご案内を送り直します。\n` +
      'お客さまにお電話で確認したアドレスであることをご確認ください。'
    )) return

    setProcessingId(bookingId)
    try {
      const res = await fetch('/api/referral/bookings/received', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ booking_id: bookingId, action: 'fix_client_email', client_email: value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        window.alert(
          data.error === 'email_invalid'
            ? 'メールアドレスの形式をご確認ください'
            : data.error === 'email_unchanged'
              ? '同じメールアドレスです'
              : '変更できませんでした',
        )
        return
      }
      window.alert(
        data.resent
          ? 'メールアドレスを変更し、ご案内を送り直しました。'
          : 'メールアドレスは変更しましたが、メールを送れませんでした。アドレスをもう一度ご確認ください。',
      )
      window.location.reload()
    } catch {
      window.alert('変更できませんでした')
    } finally {
      setProcessingId(null)
    }
  }

  /**
   * §17-9 メールが届かない予約を片付ける（CEO指示 2026-08-06）。
   * クライアントへは通知しない（届かないので送っても意味がなく、bounceを増やすだけ）。
   */
  async function discardBooking(bookingId: string) {
    if (processingId) return
    if (!window.confirm(
      'この予約を削除しますか？\n\n' +
      'お客さまにメールが届いていないため、削除のお知らせも送れません。\n' +
      'お電話で先にご連絡ください。この操作は取り消せません。'
    )) return
    setProcessingId(bookingId)
    try {
      const res = await fetch('/api/referral/bookings/received', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ booking_id: bookingId, action: 'discard' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        window.alert(
          data.error === 'payment_pending'
            ? 'この予約はお支払いが絡むため、通常のキャンセルをご利用ください。'
            : '削除できませんでした',
        )
        return
      }
      setItems((prev) => prev.filter((i) => i.id !== bookingId))
    } catch {
      window.alert('削除できませんでした')
    } finally {
      setProcessingId(null)
    }
  }

  /**
   * §17-6 予約のお客さんと REAL PROOF の中でやりとりする（CEO指示 2026-08-06）。
   * 既存の相談スレッドがあれば再利用し、無ければ作って相談タブへ送る。
   */
  async function openClientThread(bookingId: string) {
    if (processingId) return
    setProcessingId(bookingId)
    try {
      const res = await fetch(`/api/pro/bookings/${bookingId}/thread`, { method: 'POST', cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        window.alert(
          data.error === 'no_client_email'
            ? 'このお客さまのメールアドレスが記録されていないため、メッセージを送れません。お電話でご連絡ください。'
            : 'メッセージ画面を開けませんでした',
        )
        return
      }
      // §17-6(CEO指摘): 相談タブに飛ばすだけでは、どのスレッドを開けばよいか分からず書けない。
      // 開くスレッドを名指しで渡す（新規に作った空のスレッドでも、開いてすぐ書ける）。
      const threadId = data?.consultation_id
      window.location.href = threadId
        ? `/dashboard?tab=consultations&open=${encodeURIComponent(threadId)}`
        : '/dashboard?tab=consultations'
    } catch {
      window.alert('メッセージ画面を開けませんでした')
    } finally {
      setProcessingId(null)
    }
  }

  /**
   * §17-4 電話で決めた日時で確定する（CEO指示 2026-08-06）。
   * お客さんの同意をシステムが確認できない確定なので、押す前に必ず警告を出す。
   */
  async function confirmByPhone(bookingId: string) {
    const value = phoneConfirmInputs[bookingId] || ''
    if (!value || processingId) return
    if (!window.confirm(
      'お電話でお客さまと日時を決めた場合のみ、この操作を行ってください。\n\n' +
      '・お客さまの画面上の同意なしに、この日時で確定します\n' +
      '・確認メールは送りますが、メールアドレスが間違っている場合は届きません\n' +
      '・日時の取り違えがあっても、REAL PROOF では確認できません\n\n' +
      'この内容で確定しますか？'
    )) return

    setProcessingId(bookingId)
    try {
      const res = await fetch('/api/referral/bookings/received', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ booking_id: bookingId, action: 'confirm_offline', confirmed_slot: value }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        window.alert(
          data.error === 'payment_required'
            ? 'この予約は予約金のお支払いが必要なため、電話での確定はできません。通常の確定をご利用ください。'
            : data.error === 'invalid_slots'
              ? '日時をご確認ください（過去の日時は指定できません）。'
              : '確定に失敗しました'
        )
        return
      }
      setPhoneConfirmOpenId(null)
      setPhoneConfirmInputs((prev) => ({ ...prev, [bookingId]: '' }))
      // §17-9: 確定済みの日時差し替えではカードを消さない（そのまま画面に残す）。
      // 要対応 → 確定 のときだけ、既存の confirm() と同じく一覧から外す。
      const wasConfirmed = items.some((i) => i.id === bookingId && i.status === 'confirmed')
      if (wasConfirmed) {
        window.location.reload()
      } else {
        setItems((prev) => prev.filter((i) => i.id !== bookingId))
      }
    } catch {
      window.alert('確定に失敗しました')
    } finally {
      setProcessingId(null)
    }
  }

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

  // CEO指示(2026-08-08): 予約カードは折りたたみが既定（名前・紹介元orRP直・日付だけ見せる）。
  // 開いているカードのidを保持（複数同時に開ける）。
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  function toggleExpanded(bookingId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(bookingId)) next.delete(bookingId)
      else next.add(bookingId)
      return next
    })
  }

  // §17-31(CEO指示 2026-08-08): 通知メールからの着地時、該当カードへ自動スクロール＋一時ハイライト。
  // 一覧の読み込み完了(loading=false)を待ってから、描画反映のsetTimeout(300ms)後にDOMを探す
  // (card/[id]の #vote- ディープリンクと同じ流儀)。カードが無い(完了・削除済み等)場合は何もしない。
  // 依存はプリミティブのみ(highlightBookingId: string|null, loading: boolean)。
  const [flashBookingId, setFlashBookingId] = useState<string | null>(null)
  useEffect(() => {
    if (!highlightBookingId || loading) return
    // 名指しされたカードは折りたたみを解いてから探す（メールから来た人は中身に用がある）
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.add(highlightBookingId)
      return next
    })
    const scrollTimer = setTimeout(() => {
      const el = document.getElementById(`booking-card-${highlightBookingId}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setFlashBookingId(highlightBookingId)
    }, 300)
    const clearTimer = setTimeout(() => setFlashBookingId(null), 3800)
    return () => {
      clearTimeout(scrollTimer)
      clearTimeout(clearTimer)
    }
  }, [highlightBookingId, loading])

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
    if (!window.confirm(isDirectBooking(bookingId)
      ? 'このご予約のリクエストを辞退しますか？'
      : 'この紹介予約のリクエストを辞退しますか？')) return
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
    // 中2a(レビュー指摘): 相談フォームと同じく送信前に過去日時チェックを行う(直叩き対策の
    // サーバー400とは別に、ここで早期にフィードバックする)。
    if (isPastDatetimeLocalValue(slot1) || isPastDatetimeLocalValue(slot2) || isPastDatetimeLocalValue(slot3)) {
      window.alert('過去の日時は選択できません')
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
          // 追加1(2026-08-05・CEO指示): 送信時にも30分刻みへスナップする(二重の安全網)。
          counter_slots: [snapToHalfHourUp(slot1), slot2 ? snapToHalfHourUp(slot2) : null, slot3 ? snapToHalfHourUp(slot3) : null].filter(Boolean),
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
        } else if (data.error === 'invalid_slots') {
          window.alert('過去の日時は選択できません。未来の日時を入力してください')
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
    if (!window.confirm(isDirectBooking(bookingId)
      ? 'このセッションを完了しますか？'
      : 'この紹介セッションを完了しますか？')) return
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
        // §16-41修正A(CEOフィードバック 2026-08-08): 完了成功を親へ通知(完了済みサブタブへの
        // 自動遷移＋該当行のハイライトは親側/ReferralCompletedList側が担当する)。
        onCompleted?.(bookingId)
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

  /**
   * §16-41(CEO決定 2026-08-08)修正6: クライアントへの記録依頼パネル(ProofRequestPanel)の
   * 送信成功後に呼ぶ。API側で既にpreferred_slotsが更新済みのため、ここではローカル一覧の
   * 表示用フィールドだけ楽観的に更新する(サーバー往復の再取得は不要)。
   */
  function markProofRequestSent(bookingId: string) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === bookingId
          ? {
              ...i,
              proof_request_sent_at: new Date().toISOString(),
              proof_request_count: (i.proof_request_count || 0) + 1,
            }
          : i,
      ),
    )
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
    // 中2a(レビュー指摘): 送信前に過去日時チェックを行う(counterと同じ・サーバー400とは別に早期フィードバック)。
    if (isPastDatetimeLocalValue(slot1) || isPastDatetimeLocalValue(slot2) || isPastDatetimeLocalValue(slot3)) {
      window.alert('過去の日時は選択できません')
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
          // 追加1(2026-08-05・CEO指示): 送信時にも30分刻みへスナップする(二重の安全網)。
          reschedule_slots: [snapToHalfHourUp(slot1), slot2 ? snapToHalfHourUp(slot2) : null, slot3 ? snapToHalfHourUp(slot3) : null].filter(Boolean),
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
    const direct = isDirectBooking(bookingId)
    const confirmMessage = direct
      ? 'このご予約をキャンセルします。クライアントへ通知が送られます。この操作は取り消せません。よろしいですか？'
      : reason === 'client'
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
        // 軽微(レビュー指摘): 同じ算出を2回呼ばないようconstに固定する。
        const receiverTodayAmount = computeReceiverTodayAmount(item.price_jpy, item.fee_total_bps, item.payment_status)
        // CEO指示(2026-08-08): 折りたたみ時は名前・紹介元orRP直・日付だけ。日付は第1希望を代表で出す。
        const isExpanded = expandedIds.has(item.id)
        const firstSlot = slots.find(Boolean) || null
        return (
          <div
            key={item.id}
            id={`booking-card-${item.id}`}
            style={{
              background: '#F0F7FF',
              // CEO追加指示(2026-08-04): カード枠の視認性強化。requestedカードはラベルと同系の
              // オレンジ寄りにして「要対応」が一目で分かるようにする。
              border: flashBookingId === item.id ? '1.5px solid #C4A35A' : '1.5px solid #E8A874',
              boxShadow: flashBookingId === item.id ? '0 0 0 4px rgba(196,163,90,0.35)' : '0 1px 4px rgba(0,0,0,0.08)',
              transition: 'border-color 0.5s, box-shadow 0.5s',
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            {/* CEO指示(2026-08-08): 折りたたみヘッダー(常時表示・タップで開閉)。
                名前・紹介元orRP直・日付だけ。メール未達は畳んでいても気づけるよう赤チップを出す。 */}
            <button
              type="button"
              onClick={() => toggleExpanded(item.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <StatusPill label="要対応" bg="#FFE4DE" color="#C2410C" />
                  {item.preferred_slots?.receipt_email_failed && (
                    <span style={{
                      fontSize: 13, fontWeight: 700, padding: '2px 10px', borderRadius: 999,
                      background: '#FFF3F3', color: '#B00020', border: '1px solid #F0BDBD',
                      marginBottom: 8,
                    }}>メール届かず</span>
                  )}
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1A2E', lineHeight: 1.4 }}>
                  {item.client_nickname}さん
                </div>
                {/* §17-1: どこから来た予約かを1行で（紹介元がいない直接予約と見分けがつくように） */}
                <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>
                  {item.sender_pro?.name ? `紹介元: ${item.sender_pro.name}さん` : 'REALPROOFからのご予約'}
                </div>
                {counterProposed ? (
                  <div style={{ fontSize: 13, color: '#B26A00', marginTop: 2 }}>別日時を提案中</div>
                ) : firstSlot ? (
                  <div style={{ fontSize: 13, color: '#1A1A2E', fontWeight: 600, marginTop: 2 }}>
                    第1希望: {formatSlot(firstSlot)}
                  </div>
                ) : null}
              </div>
              <Chevron open={isExpanded} />
            </button>
            {isExpanded && (
            <div style={{ marginTop: 10 }}>
            {/* CEO指摘(2026-08-06): メールアドレスの打ち間違いだと、お客さんには何も届かないのに
                予約だけが入る。届いていないことをプロに伝え、電話に切り替えてもらう
                （電話番号は予約フォームの必須項目なので、連絡手段は必ず1つ残っている）。 */}
            {item.preferred_slots?.receipt_email_failed && item.email_fix_owner && (
              <div style={{
                background: '#FFF3F3', border: '1px solid #F0BDBD', borderRadius: 8,
                padding: '10px 12px', marginBottom: 8,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#B00020', marginBottom: 2 }}>
                  お客さんに受付メールが届いていません
                </div>
                {/* §17-16(CEO指示 2026-08-06): 紹介予約はまず**紹介元**が直す。
                    紹介元はそのお客さまを紹介した本人なので、電話するのに無理がない。
                    受け手には会ったこともない他人へ電話させない。ここでは状況だけ出す。 */}
                {item.email_fix_owner === 'sender' ? (
                  <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.7 }}>
                    紹介元の{item.sender_pro?.name ? `${item.sender_pro.name}さん` : '先生'}が、
                    お客さまに確認しています。連絡がつき次第、ご案内が届きます。
                  </div>
                ) : (
                  <>
                <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.7 }}>
                  お電話でご連絡をお願いします。
                </div>
                {/* §17-9(CEO指摘 2026-08-06): 「プロが確定しないと電話番号が出ない」は、
                    メールが死んでいる予約では詰みになる。確定前でもここだけ連絡先を出す。 */}
                {/* CEO指摘(2026-08-06)「電話させるのが最初だから」: ここでの主役は発信。
                    削除は最後の手段なので、小さなテキストリンクに落とす。 */}
                {item.client_contact && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F0BDBD' }}>
                    {item.client_contact.name && (
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A2E', marginBottom: 6 }}>
                        {item.client_contact.name}さん
                      </div>
                    )}
                    {item.client_contact.phone && (
                      <a
                        href={`tel:${encodeURIComponent(item.client_contact.phone)}`}
                        style={{
                          display: 'block', textAlign: 'center', padding: '12px 16px', borderRadius: 10,
                          background: '#B00020', color: '#fff', fontSize: 15, fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
                        電話をかける {item.client_contact.phone}
                      </a>
                    )}
                  </div>
                )}
                {/* §17-10(CEO指示 2026-08-06): 電話で確認した正しいアドレスに直して送り直す。
                    紹介予約では予約金の支払い案内が届かないと予約が成立しないため、
                    「電話で確認 → ここで直す」を1か所にまとめる。 */}
                {emailFixOpenId === item.id ? (
                  <div style={{ marginTop: 10, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.7, marginBottom: 8 }}>
                      お電話で確認した正しいメールアドレスを入力してください。
                      保存すると、このアドレスへご案内を送り直します。
                    </div>
                    <input
                      type="email"
                      inputMode="email"
                      value={emailFixInputs[item.id] || ''}
                      onChange={(e) => setEmailFixInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      placeholder="example@mail.com"
                      style={{
                        width: '100%', padding: '10px 12px', fontSize: 14,
                        border: '1px solid #E5E7EB', borderRadius: 8, boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => fixClientEmail(item.id)}
                        disabled={processingId === item.id || !(emailFixInputs[item.id] || '').trim()}
                        style={{
                          flex: 1, padding: '10px 12px', borderRadius: 8, border: 'none',
                          background: (emailFixInputs[item.id] || '').trim() ? '#1A1A2E' : '#E5E7EB',
                          color: (emailFixInputs[item.id] || '').trim() ? '#fff' : '#9CA3AF',
                          fontSize: 13, fontWeight: 700,
                          cursor: processingId === item.id ? 'default' : 'pointer',
                        }}
                      >
                        保存して送り直す
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmailFixOpenId(null)}
                        style={{
                          padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB',
                          background: '#fff', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        やめる
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEmailFixOpenId(item.id)}
                    style={{
                      width: '100%', marginTop: 8, padding: '10px 14px', borderRadius: 8,
                      border: '1px solid #B00020', background: '#fff', color: '#B00020',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    メールアドレスを直す
                  </button>
                )}
                {item.payment_status !== 'paid' && item.payment_status !== 'awaiting' && (
                  <button
                    type="button"
                    onClick={() => discardBooking(item.id)}
                    disabled={processingId === item.id}
                    style={{
                      display: 'block', margin: '10px auto 0', padding: 0,
                      background: 'none', border: 'none',
                      color: '#9CA3AF', fontSize: 11, textDecoration: 'underline',
                      cursor: processingId === item.id ? 'default' : 'pointer',
                    }}
                  >
                    この予約を削除する
                  </button>
                )}
                  </>
                )}
              </div>
            )}
            {theme && <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>テーマ: {theme}</div>}
            {item.menu_name && <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>メニュー: {item.menu_name}</div>}
            {note && <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>補足: {note}</div>}
            {/* タスクA(2026-08-05・CEO指示・再設計): 確定判断の材料として、requestedカードにも当日受取額を出す。 */}
            {receiverTodayAmount && <ReceiverTodayAmountBlock amount={receiverTodayAmount} />}

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

                {/* §17-4(CEO指示 2026-08-06): 電話で口頭で決まったら、プロ側から確定できるようにする。
                    §17-3の④（受付メールが届かなかった場合の逃げ道）と対になる機能。
                    押した先で必ず警告を出す（お客さんの同意をシステムが確認できない確定のため）。 */}
                {phoneConfirmOpenId === item.id ? (
                  <div style={{ marginTop: 6, marginBottom: 8, padding: '10px 12px', background: '#fff', borderRadius: 8, border: '1px solid #F0BDBD' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#B00020', marginBottom: 4 }}>
                      お電話で決めた日時で確定する
                    </div>
                    <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.7, marginBottom: 8 }}>
                      お客さまと直接お話しして日時が決まっている場合のみお使いください。
                      お客さまの希望日時になくてもかまいません。
                    </div>
                    <SlotPicker
                      value={phoneConfirmInputs[item.id] || ''}
                      timeOptions={PRO_SLOT_TIME_OPTIONS}
                      onChange={(next) => setPhoneConfirmInputs((prev) => ({ ...prev, [item.id]: next }))}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        onClick={() => confirmByPhone(item.id)}
                        disabled={processingId === item.id || !phoneConfirmInputs[item.id]}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: 'none',
                          background: phoneConfirmInputs[item.id] ? '#1A1A2E' : '#E5E7EB',
                          color: phoneConfirmInputs[item.id] ? '#fff' : '#9CA3AF',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: processingId === item.id || !phoneConfirmInputs[item.id] ? 'default' : 'pointer',
                          opacity: processingId === item.id ? 0.6 : 1,
                        }}
                      >
                        この日時で確定する
                      </button>
                      <button
                        onClick={() => setPhoneConfirmOpenId(null)}
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
                ) : (
                  <button
                    onClick={() => { setPhoneConfirmOpenId(item.id); setCounterOpenId(null) }}
                    style={{
                      width: '100%',
                      padding: '6px 12px',
                      marginBottom: 4,
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      color: item.preferred_slots?.receipt_email_failed ? '#B00020' : '#6B7280',
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: 'underline',
                      cursor: 'pointer',
                    }}
                  >
                    お電話で決めた日時で確定する
                  </button>
                )}

                {/* CEO指摘(2026-08-06): メールが届かない相手には提案そのものが届かない。
                    出しても機能しないので隠す（電話で決めて「お電話で決めた日時で確定する」を使う）。 */}
                {item.preferred_slots?.receipt_email_failed ? null : !isCounterOpen ? (
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
                    {/* カード化(2026-08-05・CEO指示): 第1〜第3希望を独立カード+段階的追加で表示する。 */}
                    <SlotCardGroup
                      values={counterInput}
                      timeOptions={PRO_SLOT_TIME_OPTIONS}
                      onChangeAt={(i, next) => {
                        const nextInput: [string, string, string] = [...counterInput] as [string, string, string]
                        nextInput[i] = next
                        setCounterInputs((prev) => ({ ...prev, [item.id]: nextInput }))
                      }}
                    />
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
          // 軽微(レビュー指摘): 同じ算出を2回呼ばないようconstに固定する。
          const receiverTodayAmount = computeReceiverTodayAmount(item.price_jpy, item.fee_total_bps, item.payment_status)
          // CEO追加指示(2026-08-04): プロ側にもGoogleカレンダー追加リンクを出す。支払い待ち(awaiting)
          // 中はまだ成立していないため非表示、確定日時が解決できない場合も非表示(buildGoogleCalendarUrl
          // 自体もinvalid ISOでnullを返す・env非依存でclientからimport可能)。
          const calendarUrl =
            item.payment_status !== 'awaiting' && confirmedSlotIso
              ? buildGoogleCalendarUrl({
                  startIso: confirmedSlotIso,
                  title: item.source === 'direct'
                    ? `${item.client_nickname}さんとのご予約(REAL PROOF)`
                    : `${item.client_nickname}さんとの紹介予約(REAL PROOF)`,
                  location: receiverAddress || undefined,
                })
              : null
          const isLocationOpen = locationOpenId === item.id
          const isRescheduleOpen = rescheduleOpenId === item.id
          const rescheduleInput = rescheduleInputs[item.id] || ['', '', '']

          // レビュー指摘(軽微8): キャンセル成功直後は、カードが消える前に一時フィードバックのみ表示する。
          if (cancelledFeedbackIds.has(item.id)) {
            return (
              <div
                key={item.id}
                id={`booking-card-${item.id}`}
                style={{
                  background: '#F5F5F5',
                  border: '1.5px solid #C5CBD3',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                  borderRadius: 12,
                  padding: '14px 16px',
                }}
              >
                <StatusPill label="キャンセル" bg="#F1F5F9" color="#64748B" />
                {/* CEO追加指示(2026-08-04): 名前大きく太く＋紹介元1行のパターンに統一 */}
                <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1A2E', lineHeight: 1.4 }}>
                  {item.client_nickname}さん
                </div>
                {item.sender_pro?.name && (
                  <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>
                    紹介元: {item.sender_pro.name}さん
                  </div>
                )}
                <div style={{ fontSize: 13, color: '#4B4B4B', lineHeight: 1.6, marginTop: 6 }}>
                  キャンセルしました。返金がある場合は手続き済みです。
                </div>
              </div>
            )
          }

          const isMenuOpen = opsMenuOpenId === item.id
          const isFormOpen = isLocationOpen || isRescheduleOpen || cancelOpenId === item.id
          // CEO指示(2026-08-08): 折りたたみ時は名前・紹介元orRP直・確定日時だけ。
          const isExpanded = expandedIds.has(item.id)
          return (
          <div
            key={item.id}
            id={`booking-card-${item.id}`}
            style={{
              background: '#F9FFF9',
              border: flashBookingId === item.id ? '1.5px solid #C4A35A' : '1.5px solid #8FCB9F',
              boxShadow: flashBookingId === item.id ? '0 0 0 4px rgba(196,163,90,0.35)' : '0 1px 4px rgba(0,0,0,0.08)',
              transition: 'border-color 0.5s, box-shadow 0.5s',
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            {/* CEO指示(2026-08-08): 折りたたみヘッダー(常時表示・タップで開閉)。
                名前・紹介元orRP直・確定日時だけ。ステータスpillとメール未達チップは畳んでいても見せる。 */}
            <button
              type="button"
              onClick={() => toggleExpanded(item.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {/* CEO追加指示(2026-08-04): 現在ステータスを1つだけ表示(優先順位: 支払い待ち >
                      日時変更の返答待ち > 確定済み)。 */}
                  {item.payment_status === 'awaiting' ? (
                    <StatusPill label="お支払い待ち" bg="#FFF3E0" color="#B26A00" />
                  ) : rescheduleProposed ? (
                    <StatusPill label="日時変更の返答待ち" bg="#FEF9C3" color="#946800" />
                  ) : (
                    <StatusPill label="確定済み" bg="#DCFCE7" color="#166534" />
                  )}
                  {item.preferred_slots?.receipt_email_failed && (
                    <span style={{
                      fontSize: 13, fontWeight: 700, padding: '2px 10px', borderRadius: 999,
                      background: '#FFF3F3', color: '#B00020', border: '1px solid #F0BDBD',
                      marginBottom: 8,
                    }}>メール届かず</span>
                  )}
                </div>
                {/* CEO指摘(2026-08-06): 直接予約のニックネームは「ご相談者」固定のため、
                    本人が入力したお名前が画面に出ていなかった。開示条件を満たしていれば実名を出す。 */}
                <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1A2E', lineHeight: 1.4 }}>
                  {item.client_contact?.name || item.client_nickname}さん
                </div>
                <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>
                  {item.sender_pro?.name ? `紹介元: ${item.sender_pro.name}さん` : 'REALPROOFからのご予約'}
                </div>
                {/* 確定日時(折りたたみでも必ず見える。展開時の重複表示は削除済み・CEO指示の整理) */}
                {confirmedSlotText && (
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#1A6B3C', marginTop: 2, lineHeight: 1.4 }}>
                    {confirmedSlotText}
                  </div>
                )}
              </div>
              <Chevron open={isExpanded} />
            </button>
            {isExpanded && (
            <div style={{ marginTop: 10 }}>
            {/* §17-4: 電話で確定した予約は、お客さん側に確定の記録が残っていない可能性がある。
                当日の行き違いを防ぐため、プロの画面に必ず出す。 */}
            {item.preferred_slots?.confirmed_by_phone_at && (
              <div style={{ fontSize: 13, color: '#B00020', marginTop: 2 }}>
                お電話で確定した予約です
              </div>
            )}
            {/* §17-9(CEO指示 2026-08-06): メールが届いていない確定済み予約。
                確定のお知らせも日時変更の提案も届かないので、プロ側で完結できるようにする。 */}
            {item.preferred_slots?.receipt_email_failed && item.email_fix_owner && (
              <div style={{
                background: '#FFF3F3', border: '1px solid #F0BDBD', borderRadius: 8,
                padding: '10px 12px', marginTop: 8,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#B00020', marginBottom: 2 }}>
                  お客さんにメールが届いていません
                </div>
                {/* §17-16(CEO指示 2026-08-06): 紹介予約はまず**紹介元**が直す。
                    紹介元はそのお客さまを紹介した本人なので、電話するのに無理がない。
                    受け手には会ったこともない他人へ電話させない。ここでは状況だけ出す。 */}
                {item.email_fix_owner === 'sender' ? (
                  <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.7 }}>
                    紹介元の{item.sender_pro?.name ? `${item.sender_pro.name}さん` : '先生'}が、
                    お客さまに確認しています。連絡がつき次第、ご案内が届きます。
                  </div>
                ) : (
                  <>
                {/* CEO指摘(2026-08-06)「文章が長いから、なにすればいいのかわからん」:
                    説明を1行にして、やること（電話）をボタンで見せる。 */}
                <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.7 }}>
                  お電話でご連絡をお願いします。
                </div>
                {/* 主役は発信。日時直しは次点、削除は最後の手段（CEO指摘 2026-08-06）。 */}
                {item.client_contact?.phone && (
                  <a
                    href={`tel:${encodeURIComponent(item.client_contact.phone)}`}
                    style={{
                      display: 'block', textAlign: 'center', marginTop: 10,
                      padding: '12px 16px', borderRadius: 10,
                      background: '#B00020', color: '#fff', fontSize: 15, fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    電話をかける {item.client_contact.phone}
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => { setPhoneConfirmOpenId(phoneConfirmOpenId === item.id ? null : item.id) }}
                  style={{
                    width: '100%', marginTop: 8, padding: '10px 14px', borderRadius: 8,
                    border: '1px solid #B00020', background: '#fff', color: '#B00020',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  お電話で決めた日時に直す
                </button>
                {/* §17-10(CEO指示 2026-08-06): 電話で確認した正しいアドレスに直して送り直す。
                    紹介予約では予約金の支払い案内が届かないと予約が成立しないため、
                    「電話で確認 → ここで直す」を1か所にまとめる。 */}
                {emailFixOpenId === item.id ? (
                  <div style={{ marginTop: 10, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.7, marginBottom: 8 }}>
                      お電話で確認した正しいメールアドレスを入力してください。
                      保存すると、このアドレスへご案内を送り直します。
                    </div>
                    <input
                      type="email"
                      inputMode="email"
                      value={emailFixInputs[item.id] || ''}
                      onChange={(e) => setEmailFixInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      placeholder="example@mail.com"
                      style={{
                        width: '100%', padding: '10px 12px', fontSize: 14,
                        border: '1px solid #E5E7EB', borderRadius: 8, boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => fixClientEmail(item.id)}
                        disabled={processingId === item.id || !(emailFixInputs[item.id] || '').trim()}
                        style={{
                          flex: 1, padding: '10px 12px', borderRadius: 8, border: 'none',
                          background: (emailFixInputs[item.id] || '').trim() ? '#1A1A2E' : '#E5E7EB',
                          color: (emailFixInputs[item.id] || '').trim() ? '#fff' : '#9CA3AF',
                          fontSize: 13, fontWeight: 700,
                          cursor: processingId === item.id ? 'default' : 'pointer',
                        }}
                      >
                        保存して送り直す
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmailFixOpenId(null)}
                        style={{
                          padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB',
                          background: '#fff', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        やめる
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEmailFixOpenId(item.id)}
                    style={{
                      width: '100%', marginTop: 8, padding: '10px 14px', borderRadius: 8,
                      border: '1px solid #B00020', background: '#fff', color: '#B00020',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    メールアドレスを直す
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => discardBooking(item.id)}
                  disabled={processingId === item.id}
                  style={{
                    display: 'block', margin: '10px auto 0', padding: 0,
                    background: 'none', border: 'none',
                    color: '#9CA3AF', fontSize: 11, textDecoration: 'underline',
                    cursor: processingId === item.id ? 'default' : 'pointer',
                  }}
                >
                  この予約を削除する
                </button>
                {phoneConfirmOpenId === item.id && (
                  <div style={{ marginTop: 10, background: '#fff', borderRadius: 8, padding: '10px 12px', border: '1px solid #E5E7EB' }}>
                    <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, lineHeight: 1.7 }}>
                      お電話で決めた日時に差し替えます（お客さまへの通知は送られません）。
                    </div>
                    <SlotPicker
                      value={phoneConfirmInputs[item.id] || ''}
                      timeOptions={PRO_SLOT_TIME_OPTIONS}
                      onChange={(next) => setPhoneConfirmInputs((prev) => ({ ...prev, [item.id]: next }))}
                    />
                    <button
                      type="button"
                      onClick={() => confirmByPhone(item.id)}
                      disabled={processingId === item.id || !phoneConfirmInputs[item.id]}
                      style={{
                        width: '100%', marginTop: 8, padding: '8px 12px', borderRadius: 8, border: 'none',
                        background: phoneConfirmInputs[item.id] ? '#1A1A2E' : '#E5E7EB',
                        color: phoneConfirmInputs[item.id] ? '#fff' : '#9CA3AF',
                        fontSize: 13, fontWeight: 700,
                        cursor: processingId === item.id || !phoneConfirmInputs[item.id] ? 'default' : 'pointer',
                      }}
                    >
                      この日時に直す
                    </button>
                  </div>
                )}
                {/* CEO質問(2026-08-06)「予約金がある場合は？」への対応。
                    予約金が動いている予約は削除（通知なし・返金判定なし）に流してはいけないので、
                    返金の判定が入る通常のキャンセルへ誘導する。長い説明は最後に小さく置く。 */}
                {(item.payment_status === 'paid' || item.payment_status === 'awaiting') && (
                  <div style={{ fontSize: 11, color: '#B26A00', lineHeight: 1.7, marginTop: 8 }}>
                    取りやめる場合は「変更・キャンセルなどの操作」から（返金の判定が入ります）。
                  </div>
                )}
                  </>
                )}
              </div>
            )}
            {/* CEO指示(2026-08-08・整理): 紹介元の行はヘッダーへ移動（重複のためここから削除） */}

            {/* CEO指摘(2026-08-06)「クライアントが入力した相談内容が表示されない」:
                要対応カードには出していたが、確定済みカードに引き継いでいなかった。
                当日に向けて一番読みたい情報なので、確定後こそ出す。 */}
            {(item.theme_tags?.[0] || item.preferred_slots?.note || item.menu_name) && (
              <div style={{ marginTop: 8 }}>
                {item.menu_name && (
                  <div style={{ fontSize: 13, color: '#555', marginBottom: 2 }}>メニュー: {item.menu_name}</div>
                )}
                {item.theme_tags?.[0] && (
                  <div style={{ fontSize: 13, color: '#555', marginBottom: 2 }}>テーマ: {item.theme_tags[0]}</div>
                )}
                {item.preferred_slots?.note && (
                  <div style={{ fontSize: 13, color: '#555', whiteSpace: 'pre-wrap' as const }}>
                    ご相談内容: {item.preferred_slots.note}
                  </div>
                )}
              </div>
            )}

            {/* CEO指示(2026-08-08・整理): 確定日時はヘッダーで常時表示するため、本文側の
                大型表示(旧: 20px太字)は重複として削除。 */}
            {/* タスクA(2026-08-05・CEO指示・再設計): 確定日時のすぐ下に当日の受取額を表示する。 */}
            {receiverTodayAmount && (
              <div style={{ marginTop: 6 }}>
                <ReceiverTodayAmountBlock amount={receiverTodayAmount} />
              </div>
            )}
            {/* CEO追加指示(2026-08-04): プロ側のGoogleカレンダー追加リンク(控えめなテキストリンク)。 */}
            {calendarUrl && (
              <a
                href={calendarUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 13, color: '#1A6B3C', textDecoration: 'underline', display: 'inline-block', marginTop: 4 }}
              >
                Googleカレンダーに追加
              </a>
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
                日時変更は受け入れられませんでした（現在の日時のまま実施します）
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
                {/* §17-6(CEO指示 2026-08-06): メールアドレスは表示しない。
                    出した瞬間にやりとりが REAL PROOF の外へ出て、記録も通報の受け口も
                    次の紹介への接続も消える（§16-30「リードはこっちで握る」）。
                    代わりに相談チャットへ寄せる。既にある往復・通報・送信取り消しがそのまま使える。
                    電話は残す: 当日の連絡と、メールが死んでいる場合の唯一の手段のため。 */}
                <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
                  {item.preferred_slots?.receipt_email_failed
                    ? 'メールが届いていないため、ご連絡はお電話のみになります。'
                    : '当日のご連絡はお電話で。メッセージは REAL PROOF の中でやりとりできます。'}
                </div>
                {/* §17-9(CEO指摘 2026-08-06): メールが届いていないクライアントはチャットも使えない
                    （やりとりの通知もメールで飛ぶため）。押せるだけ無駄なので出さない。

                    §17-22(CEO指摘 2026-08-07・不具合): ここに payment_status の例外が紛れていた。
                    「予約金が絡むときは逃げ道を残す」は**下の操作メニュー**に必要な例外で、
                    このボタンには関係が無かった（チャットの通知はメールなので、支払い状況が
                    どうであれ相手には届かない＝押せるだけ無駄なボタンが出ていた）。
                    例外を持ち回すときは、その理由がその場所にも当てはまるかを必ず確かめる。

                    SMSが通っていても（contact_recovered_by_sms_at）ここは出さない。
                    SMSで送るのは予約状況のリンクだけで、チャットの通知経路はメールのままのため。 */}
                {!item.preferred_slots?.receipt_email_failed && (
                <button
                  type="button"
                  onClick={() => openClientThread(item.id)}
                  disabled={processingId === item.id}
                  style={{
                    width: '100%', marginTop: 8, padding: '10px 12px', borderRadius: 8,
                    border: '1.5px solid #1A1A2E', background: '#fff', color: '#1A1A2E',
                    fontSize: 13, fontWeight: 700,
                    cursor: processingId === item.id ? 'default' : 'pointer',
                    opacity: processingId === item.id ? 0.6 : 1,
                  }}
                >
                  メッセージを送る
                </button>
                )}
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
              {item.source === 'direct' ? 'セッションを完了する' : '紹介セッションを完了する'}
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

            {/* §16-41(CEO決定 2026-08-08): クライアントへの記録依頼。完了時の自動送信はCEOが却下
                しているため、セッション実施済み(確定日時が過去)のカードにこのボタンを出す。
                完了(completed)後は同じ機能をReferralCompletedList側に持つ。
                修正6(レビュー指摘・中8): パネル本体はProofRequestPanelに集約。このラッパーdiv
                (枠線の向き・margin/padding)と表示条件だけをここに残す(2箇所で異なるため)。 */}
            {confirmedSlotIso && new Date(confirmedSlotIso).getTime() < Date.now() && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #E5E7EB' }}>
                <ProofRequestPanel
                  bookingId={item.id}
                  sentAt={item.proof_request_sent_at || null}
                  count={item.proof_request_count || 0}
                  recorded={!!item.proof_recorded}
                  onSent={() => markProofRequestSent(item.id)}
                  background="#fff"
                />
              </div>
            )}

            {/* 案件スレッド・引き継ぎメモ(開閉は既存のまま)
                §17-6(CEO指摘 2026-08-06): 直接予約には出さない。どちらも「紹介元のプロ」と
                やりとりするための道具で、紹介元がいない予約では相手が存在しない。 */}
            {item.source !== 'direct' && (
              <BookingThread
                bookingId={item.id}
                ownProId={proId}
                isSender={false}
                initialHandoverNote={item.handover_note}
                partnerRoleLabel={item.sender_pro ? '紹介元' : undefined}
                partnerName={item.sender_pro?.name}
                initialOpen={!!highlightThreadOpen && highlightBookingId === item.id}
              />
            )}

            {/* 例外操作: 「変更・キャンセルなどの操作 ▼」に集約。一度に1つのことだけ画面に出す原則
                (フォームを開いたらそのフォームだけ表示・戻るで一覧に戻れる)。
                機能・API呼び出し・ガード条件は既存のまま(locationOpenId/rescheduleOpenId/cancelOpenId
                及び各handlerを変更していない)。 */}
            {/* CEO指摘(2026-08-06)「通常の日時変更操作も出さないで。これも機能しないから」:
                この中身（当日の場所を送る／日時変更を提案する／キャンセル）はすべて
                クライアントへのメール送信が前提。メールが届かない相手には1つも機能しない。
                代わりに上の赤いブロック（電話 → 日時を直す → 削除）で完結させる。 */}
            {!item.preferred_slots?.receipt_email_failed && (
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
                  {/* カード化(2026-08-05・CEO指示): 第1〜第3希望を独立カード+段階的追加で表示する。 */}
                  <SlotCardGroup
                    values={rescheduleInput}
                    timeOptions={PRO_SLOT_TIME_OPTIONS}
                    onChangeAt={(i, next) => {
                      const nextInput: [string, string, string] = [...rescheduleInput] as [string, string, string]
                      nextInput[i] = next
                      setRescheduleInputs((prev) => ({ ...prev, [item.id]: nextInput }))
                    }}
                  />
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

                  {/* CEO報告(2026-08-08): 直予約には予約金が無く72時間返金ルール自体が存在しないため、
                      連絡日時入力・返金説明のブロックごと表示しない(誤解防止)。 */}
                  {selectedCancelReason === 'client' && !isDirectBooking(item.id) && (
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
            )}
            </div>
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
            id={`booking-card-${item.id}`}
            style={{
              background: '#F5F5F5',
              border: flashBookingId === item.id ? '1.5px solid #C4A35A' : '1.5px solid #C5CBD3',
              boxShadow: flashBookingId === item.id ? '0 0 0 4px rgba(196,163,90,0.35)' : '0 1px 4px rgba(0,0,0,0.08)',
              transition: 'border-color 0.5s, box-shadow 0.5s',
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            <StatusPill label="キャンセル" bg="#F1F5F9" color="#64748B" />
            {/* CEO追加指示(2026-08-04): 名前大きく太くの統一パターン。この種別にはsender_pro
                データが無いため紹介元行は出さず、キャンセル理由の説明文をそのまま残す。 */}
            <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1A2E', lineHeight: 1.4 }}>
              {item.client_nickname}さん
            </div>
            <div style={{ fontSize: 13, color: '#4B4B4B', lineHeight: 1.6, marginTop: 4 }}>
              紹介予約は、期限内にお支払いが確認できなかったためキャンセルされました
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
