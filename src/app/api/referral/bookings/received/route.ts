import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'
import {
  notifyBookingConfirmedToSender,
  notifyBookingDeclinedToSender,
  notifyBookingCounterProposedToSender,
  notifyBookingCompletedToSender,
  notifyCounterProposedToClient,
  notifyClientByEmail,
  referralListFooterHtml,
  emailShell,
  escapeHtml,
  buildBookingLocationContactHtml,
  buildCalendarLinkHtml,
  buildRescheduleContactNoteHtml,
  notifyRescheduleProposedToClient,
  notifyLocationToClient,
  notifyBookingCancelledByReceiverToClient,
  notifyBookingCancelledByReceiverToSender,
} from '@/lib/referral-notify'
import {
  formatSlot,
  formatSlotWithWeekday,
  parseSlot,
  buildGoogleCalendarUrl,
  resolveConfirmedSlotIso,
  isWithinClientRefundDeadline,
} from '@/lib/referral-format'
import { isReferralPaymentEnabled, REFERRAL_MIN_FEE_JPY, REFERRAL_FEE_TOTAL_BPS } from '@/lib/feature-flags'
// 中1レビュー指摘から継続: Stripe importはこのAPI routeに持たせない(Webpackチャンクグラフ対策)。
// Checkout Session作成+メール送付(共通処理)はsrc/lib/referral-payment.tsの関数呼び出しに委譲する。
import { issueFeePaymentLinkAndNotify, refundReferralBookingFee, expireReferralCheckoutSession } from '@/lib/referral-payment'
// ステージ4(送り手分配・2026-08-04・CEO決定): Stripeに触らない独立ファイル(referral-payment.tsとは
// チャンクグラフを分ける)。完了確定時に送り手分配行(referral_payouts)を1回だけ作成する。
import { createReferralPayoutIfEligible } from '@/lib/referral-payout'

export const dynamic = 'force-dynamic'

const APP_URL = 'https://realproof.jp'
/** ライフサイクル改善(タスクA・逆指定): counter提案でexpires_atを48hリセットする際に使う */
const COUNTER_EXPIRES_HOURS = 48

interface PreferredSlots {
  slots?: (string | null)[]
  note?: string | null
  confirmed_index?: number
  /** ライフサイクル改善(タスクA): 受け手が提案した別日時(逆指定)。requestedのまま保持する。 */
  counter_slots?: string[]
  counter_proposed_at?: string
  /** ライフサイクル改善(タスクB): クライアントが承諾したcounter_slotsのindex */
  confirmed_counter_index?: number
  /**
   * ライフサイクル改善(2026-08-04・タスクB・CEO指示): 確定後にプロが提案する日時変更(最大3枠)。
   * counter_slots(requested時点の逆指定)とは別キー。再提案は上書き可。
   */
  reschedule_slots?: string[] | null
  reschedule_proposed_at?: string
  /** クライアントが日時変更提案に応答した時刻(選択/現在のまま、いずれも記録)。未回答はundefined/null。 */
  reschedule_resolved_at?: string | null
  /**
   * クライアントが日時変更提案から選んだ確定ISO文字列(推奨方式)。既存のconfirmed_index/
   * confirmed_counter_index による解決より優先する(既存箇所が多いためフォールバックとして両方維持)。
   */
  confirmed_slot_iso?: string | null
  /**
   * タスク②(2026-08-04・CEO指示): プロ都合キャンセル(cancel_by_receiver)実行時のマーカー。
   * cronの支払い期限切れ自動キャンセル(payment_status='canceled'共用)との区別に使う。
   */
  cancelled_by_receiver_at?: string | null
  /**
   * CEO決定(2026-08-04・追加): cancel_by_receiverの「どちらの都合か」の記録。
   * 'pro'=プロ都合(常に全額返金)/'client_early'=クライアント都合・セッション開始72時間前ルール内(全額返金)/
   * 'client_late'=クライアント都合・セッション開始72時間前ルール外(返金なし)。監査・表示用途で残す(集計未実装)。
   */
  cancel_reason?: 'pro' | 'client_early' | 'client_late' | null
  /**
   * レビュー指摘(軽微1): クライアントが「候補では難しいため現在の日時を希望する」(keep_current)を
   * 選んだ際のマーカー。reschedule-respond側で解決時に必ず明示的にセット/nullで上書きする
   * (confirmed_slot_isoは他ラウンドでも残るため、単独では2周目以降の判別に使えない)。
   */
  reschedule_kept_current_at?: string | null
}

/**
 * PII注意: clients.user_id / client_email はメール送信にのみ使う。レスポンスには絶対含めない。
 * client_name/client_phone/client_email は§2-4ステージ3(CEO決定)で開示制御対象。
 * GETのレスポンスへは canDiscloseContact() の条件を満たす行のみ client_contact として含める。
 */
interface BookingRow {
  id: string
  list_id: string
  sender_pro_id: string | null
  receiver_pro_id: string
  client_id: string
  client_email: string | null
  menu_id: string | null
  theme_tags: string[] | null
  preferred_slots: PreferredSlots | null
  status: string
  price_jpy: number
  payment_status: string | null
  fee_total_bps: number | null
  /** タスク②(2026-08-04・CEO指示): プロ都合キャンセル時の決済リンク失効に使う(migration 036依存)。 */
  stripe_checkout_session_id: string | null
  /** タスク②(2026-08-04・CEO指示): プロ都合キャンセル時の返金照合に使う(migration 032で作成済み)。 */
  stripe_payment_intent_id: string | null
  expires_at: string | null
  confirmed_at: string | null
  completed_at: string | null
  created_at: string
  clients: { id: string; user_id: string; nickname: string } | null
  referral_lists: { id: string; slug: string; comment: string | null } | null
  pro_menus: { name: string } | null
}

/**
 * §2-4ステージ3(決済確認後の連絡先開示・CEO決定): クライアントの氏名・電話番号・メールは
 * 「決済確認がとれた後」にのみ受け手プロへ開示する。開示条件は以下のみ:
 *   status IN ('confirmed','completed') かつ
 *   (payment_status === 'paid' または 'not_required' または null/undefined(決済無効期に
 *    作られた旧予約でpayment_statusカラム自体を参照しない場合))
 * awaiting/unpaid(支払い前)は開示しない。requested/draft/cancelled/expiredは状態に関わらず
 * 開示しない(status条件で既に弾かれる)。
 * ★ この関数がPIIの唯一のゲートになる。開示条件を変更する場合は必ずレビューを通すこと。
 */
function canDiscloseContact(booking: { status: string; payment_status?: string | null }): boolean {
  if (booking.status !== 'confirmed' && booking.status !== 'completed') return false
  const ps = booking.payment_status
  return ps === 'paid' || ps === 'not_required' || ps === null || ps === undefined
}

/**
 * GET /api/referral/bookings/received
 * 受け手プロ本人の requested/confirmed 一覧。クライアントは原則 nickname のみ(PII含めない)。
 * §2-4ステージ3(決済確認後の連絡先開示・CEO決定): canDiscloseContact() の条件を満たす行のみ
 * client_contact(name/phone/email)を追加で含める。満たさない行は client_contact: null。
 * ★ isReferralEnabled ではゲートしない(受け手は先行アクセス外でもリクエストを受けられる必要がある)。
 * タスク⑥: レスポンスに `completed`(completed_at desc・limit 200)を追加。既存の `bookings` の形は変更しない。
 * タスク①(2026-08-04・CEO指示): レスポンスに `cancelled_unpaid`(支払い期限切れキャンセル・
 * confirmed_at desc・limit 20)を追加。連絡先(client_contact)は含めない(開示条件外)。
 */
export async function GET() {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    // タスクA(2026-08-04・CEO指示): 「デフォルトの場所として保存する」チェックボックスは
    // professionals.address が未設定の場合のみ表示する(受け手自身の設定なので全カード共通の1値)。
    let receiverAddressSet = false
    // CEO指摘(2026-08-04): 住所設定済みの場合、カードには「設定済みの場所を成立メールで送付済み」と
    // 表示するため住所の実値も返す(受け手本人のプロフィール値で公開カードにも表示される情報・PIIゲート対象外)。
    let receiverAddress: string | null = null
    try {
      const { data: addressRow } = await supabase
        .from('professionals')
        .select('address')
        .eq('id', ownPro.id)
        .maybeSingle()
      receiverAddress = (addressRow as { address: string | null } | null)?.address || null
      receiverAddressSet = !!receiverAddress
    } catch (addressErr) {
      console.error('[api/referral/bookings/received] address fetch error (fail-soft):', addressErr)
    }

    // §2-4ステージ3(予約フィー方式): payment_statusはmigration 036依存のカラムのため、
    // 既存の他ファイル(cron/expire-referral-bookings等)と同様にフラグゲート付きで選択する。
    // paymentEnabledがfalseの間はカラム自体を選択しない(=canDiscloseContactにはundefinedが渡り、
    // 「決済無効期」として扱われる。これは仕様どおり: フラグOFFの予約は確定時点で開示してよい)。
    // client_name/client_phone/client_emailはcanDiscloseContact()の条件を満たす行のみ
    // レスポンスに含める(このAPI内で組み立てる。selectはPII開示制御の対象ではなく、
    // レスポンス組み立て側でゲートする)。
    const paymentEnabled = isReferralPaymentEnabled()
    const baseBookingSelect =
      'id, list_id, sender_pro_id, receiver_pro_id, client_id, client_name, client_phone, client_email, menu_id, theme_tags, preferred_slots, status, price_jpy, expires_at, confirmed_at, completed_at, created_at, clients(id, nickname), referral_lists(id, slug, comment), pro_menus(name)'
    const bookingSelect = paymentEnabled ? `${baseBookingSelect}, payment_status` : baseBookingSelect
    const { data: bookings, error } = await supabase
      .from('referral_bookings')
      .select(bookingSelect)
      .eq('receiver_pro_id', ownPro.id)
      .in('status', ['requested', 'confirmed'])
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[api/referral/bookings/received] GET error:', error)
      return NextResponse.json({ error: 'failed_to_fetch' }, { status: 500 })
    }

    // タスク⑥: 完了済み(completed)は別クエリで取得(fail-soft)。requested/confirmedの取得を壊さない。
    let completedBookings: any[] = []
    try {
      const completedBaseSelect =
        'id, list_id, sender_pro_id, receiver_pro_id, client_id, client_name, client_phone, client_email, menu_id, theme_tags, status, price_jpy, handover_note, confirmed_at, completed_at, created_at, clients(id, nickname), pro_menus(name)'
      const completedSelect = paymentEnabled ? `${completedBaseSelect}, payment_status` : completedBaseSelect
      const { data: completedRows, error: completedError } = await supabase
        .from('referral_bookings')
        .select(completedSelect)
        .eq('receiver_pro_id', ownPro.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(200)
      if (completedError) {
        console.error('[api/referral/bookings/received] completed fetch error (fail-soft):', completedError)
      } else {
        completedBookings = completedRows || []
      }
    } catch (completedErr) {
      console.error('[api/referral/bookings/received] completed fetch error (fail-soft):', completedErr)
    }

    // タスク①(2026-08-04・CEO指示): 支払い期限切れで自動キャンセルされた紹介予約を受け手へ可視化する。
    // 対象は「確定後に予約フィー未払いで自動キャンセルされたもの」のみ(confirmed_at IS NOT NULL)。
    // draft掃除由来のcancelled(confirmed_at無し)は自然に除外される。receiver_dismissed_atが
    // 入っている行(閉じるボタン押下済み)は対象外。paymentEnabled(migration 036依存カラム)の
    // 間だけ実行する(fail-soft・既存配列の形は変えない)。
    // タスク②(2026-08-04・CEO指示): プロ都合キャンセル(cancel_by_receiver)はpayment_status='canceled'を
    // 共用するため、この一覧に混ざらないよう preferred_slots.cancelled_by_receiver_at(マーカー)が
    // 付いている行は除外する(既存のreschedule-respond routeと同じ ->> JSON path filter方式)。
    let cancelledUnpaidRows: any[] = []
    if (paymentEnabled) {
      try {
        const { data: cancelledRows, error: cancelledError } = await supabase
          .from('referral_bookings')
          .select('id, menu_id, preferred_slots, confirmed_at, clients(id, nickname), pro_menus(name)')
          .eq('receiver_pro_id', ownPro.id)
          .eq('status', 'cancelled')
          .eq('payment_status', 'canceled')
          .not('confirmed_at', 'is', null)
          .is('receiver_dismissed_at', null)
          .filter('preferred_slots->>cancelled_by_receiver_at', 'is', null)
          .order('confirmed_at', { ascending: false })
          .limit(20)
        if (cancelledError) {
          console.error('[api/referral/bookings/received] cancelled_unpaid fetch error (fail-soft):', cancelledError)
        } else {
          cancelledUnpaidRows = cancelledRows || []
        }
      } catch (cancelledErr) {
        console.error('[api/referral/bookings/received] cancelled_unpaid fetch error (fail-soft):', cancelledErr)
      }
    }

    // referral_bookings は professionals への FK が2本(sender/receiver)あり embed が曖昧になるため、
    // sender_pro_id は別クエリで取得する(reward-reminder cron と同じ回避方針)。
    const senderIds = Array.from(
      new Set(
        [...(bookings || []), ...completedBookings]
          .map((b: any) => b.sender_pro_id)
          .filter(Boolean)
      )
    )
    let sendersMap: Record<string, { id: string; name: string }> = {}
    if (senderIds.length > 0) {
      const { data: senders } = await supabase.from('professionals').select('id, name').in('id', senderIds)
      for (const s of (senders || []) as Array<{ id: string; name: string }>) {
        sendersMap[s.id] = s
      }
    }

    // §2-10: 引き継ぎメモ(handover_note)を別クエリで取得する(fail-soft)。
    // migration 031 未反映環境でも、この取得の失敗が予約一覧の表示自体を壊さないようにする。
    let handoverMap: Record<string, unknown> = {}
    try {
      const bookingIds = ((bookings || []) as any[]).map((b) => b.id)
      if (bookingIds.length > 0) {
        const { data: handoverRows, error: handoverError } = await supabase
          .from('referral_bookings')
          .select('id, handover_note')
          .in('id', bookingIds)
        if (handoverError) {
          console.error('[api/referral/bookings/received] handover_note fetch error (fail-soft):', handoverError)
        } else {
          for (const row of (handoverRows || []) as Array<{ id: string; handover_note: unknown }>) {
            handoverMap[row.id] = row.handover_note
          }
        }
      }
    } catch (handoverErr) {
      console.error('[api/referral/bookings/received] handover_note fetch error (fail-soft):', handoverErr)
    }

    const result = ((bookings || []) as any[]).map((b) => ({
      id: b.id,
      list_id: b.list_id,
      menu_id: b.menu_id,
      menu_name: b.pro_menus?.name || null,
      theme_tags: b.theme_tags,
      preferred_slots: b.preferred_slots,
      status: b.status,
      price_jpy: b.price_jpy,
      // §2-4ステージ3: 決済有効時のみpayment_status(状態のみ)を返す。金額は含めない。
      payment_status: paymentEnabled ? b.payment_status || null : null,
      handover_note: handoverMap[b.id] || null,
      expires_at: b.expires_at,
      confirmed_at: b.confirmed_at,
      created_at: b.created_at,
      client_nickname: b.clients?.nickname || 'クライアント',
      sender_pro: b.sender_pro_id ? sendersMap[b.sender_pro_id] || null : null,
      // §2-4ステージ3(CEO決定): 決済確認後(canDiscloseContact参照)のみ連絡先を開示する。
      client_contact: canDiscloseContact({ status: b.status, payment_status: paymentEnabled ? b.payment_status : undefined })
        ? { name: b.client_name || null, phone: b.client_phone || null, email: b.client_email || null }
        : null,
    }))

    const completedResult = completedBookings.map((b: any) => ({
      id: b.id,
      list_id: b.list_id,
      menu_id: b.menu_id,
      menu_name: b.pro_menus?.name || null,
      theme_tags: b.theme_tags,
      status: b.status,
      price_jpy: b.price_jpy,
      handover_note: b.handover_note || null,
      confirmed_at: b.confirmed_at,
      completed_at: b.completed_at,
      created_at: b.created_at,
      client_nickname: b.clients?.nickname || 'クライアント',
      sender_pro: b.sender_pro_id ? sendersMap[b.sender_pro_id] || null : null,
      // タスク①: completed一覧も同条件で開示する(completedはpaid/not_requiredのはずだが、
      // 念のためcanDiscloseContactを必ず通す)。
      client_contact: canDiscloseContact({ status: b.status, payment_status: paymentEnabled ? b.payment_status : undefined })
        ? { name: b.client_name || null, phone: b.client_phone || null, email: b.client_email || null }
        : null,
    }))

    // タスク①: 連絡先(client_contact)は含めない(キャンセル済みは開示条件外・PII厳守)。
    const cancelledUnpaidResult = cancelledUnpaidRows.map((b: any) => ({
      id: b.id,
      menu_name: b.pro_menus?.name || null,
      preferred_slots: b.preferred_slots,
      confirmed_at: b.confirmed_at,
      client_nickname: b.clients?.nickname || 'クライアント',
    }))

    return NextResponse.json({
      bookings: result,
      completed: completedResult,
      cancelled_unpaid: cancelledUnpaidResult,
      receiver_address_set: receiverAddressSet,
      receiver_address: receiverAddress,
    })
  } catch (err: any) {
    console.error('[api/referral/bookings/received] GET error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}

/**
 * PATCH /api/referral/bookings/received
 * body: { booking_id, action: 'confirm' | 'decline' | 'complete' | 'counter' | 'dismiss_cancelled', confirmed_index?, counter_slots? }
 * 受け手プロ本人のみ操作可。confirm/decline/counter は requested のみ、expires_at超過は409。
 * §2-4-7(決済なし版)/中11レビュー指摘: complete は confirmed のみ→completed。
 * ライフサイクル改善(タスクA・逆指定): counter は、受け手が別日時を提案する。requestedのまま
 * preferred_slots.counter_slots に保存し、expires_atを48hリセットする(クライアントの返答待ち)。
 * タスク①(2026-08-04・CEO指示): dismiss_cancelled は支払い期限切れキャンセルカードの「閉じる」。
 * cancelled のみ対象。receiver_dismissed_at を記録するのみで行は物理削除しない。
 */
export async function PATCH(request: NextRequest) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const bookingId = typeof body.booking_id === 'string' ? body.booking_id : ''
    const action = body.action
    const confirmedIndex = typeof body.confirmed_index === 'number' ? body.confirmed_index : null
    // CEO決定(2026-08-04・追加): cancel_by_receiverの「どちらの都合か」。未指定は'pro'(既存互換)。
    // レビュー指摘(中6): undefined以外で'pro'/'client'以外の値は明示的に400で弾く(不正値の黒箱化を防ぐ)。
    if (body.reason !== undefined && body.reason !== 'pro' && body.reason !== 'client') {
      return NextResponse.json({ error: 'invalid_reason' }, { status: 400 })
    }
    const cancelReason: 'pro' | 'client' = body.reason === 'client' ? 'client' : 'pro'
    // レビュー指摘(重大3): クライアントから連絡を受けた日時(任意入力・reason='client'時のみUIで表示)。
    // 不正値はnull(=現在時刻を基準にする現状動作にフォールバック)。
    const rawClientRequestedAt = typeof body.client_requested_at === 'string' ? body.client_requested_at : null
    const clientRequestedAtMs =
      rawClientRequestedAt && !Number.isNaN(new Date(rawClientRequestedAt).getTime())
        ? new Date(rawClientRequestedAt).getTime()
        : null

    if (
      !bookingId ||
      (action !== 'confirm' &&
        action !== 'decline' &&
        action !== 'complete' &&
        action !== 'counter' &&
        action !== 'dismiss_cancelled' &&
        action !== 'send_location' &&
        action !== 'reschedule' &&
        action !== 'cancel_by_receiver')
    ) {
      return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const paymentEnabled = isReferralPaymentEnabled()
    // §2-4ステージ3(予約フィー方式): confirm時に予約フィー決済リンクを発行するため、
    // price_jpy/payment_status/fee_total_bps/メニュー名も取得する。
    // payment_status/fee_total_bpsはmigration 036依存のためフラグゲート付きで選択する。
    const baseConfirmSelect =
      'id, list_id, sender_pro_id, receiver_pro_id, client_id, client_email, status, price_jpy, expires_at, preferred_slots, clients(id, user_id, nickname), referral_lists(id, slug, comment), pro_menus(name)'
    // タスク②(2026-08-04・CEO指示): cancel_by_receiver用にstripe_checkout_session_id/
    // stripe_payment_intent_idも取得する(いずれもmigration 036依存カラムと同じpaymentEnabledゲート内)。
    const confirmSelect = paymentEnabled
      ? `${baseConfirmSelect}, payment_status, fee_total_bps, stripe_checkout_session_id, stripe_payment_intent_id`
      : baseConfirmSelect
    const { data: bookingData } = await supabase
      .from('referral_bookings')
      .select(confirmSelect)
      .eq('id', bookingId)
      .maybeSingle()

    const booking = bookingData as unknown as BookingRow | null
    if (!booking || booking.receiver_pro_id !== ownPro.id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    if (action === 'complete') {
      if (booking.status !== 'confirmed') {
        return NextResponse.json({ error: 'not_confirmed' }, { status: 409 })
      }
      // レビュー指摘(重大2): 予約フィーが未払い(決済リンク送付済みでまだawaiting)の間は
      // 「紹介セッションを完了する」を通せない(フィー未収のまま完了されるのを防ぐ)。
      if (paymentEnabled && booking.payment_status === 'awaiting') {
        return NextResponse.json({ error: 'payment_pending' }, { status: 409 })
      }
      // レビュー指摘(重大3b): cronの自動完了と同じ作法で0行(競合で既にキャンセル済み等)を明示的に
      // 検出し、その場合は分配作成・通知を一切行わず409で止める(誤計上防止)。
      const { data: completedRows, error: completeError } = await supabase
        .from('referral_bookings')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', bookingId)
        .eq('status', 'confirmed')
        .select('id')

      if (completeError) {
        console.error('[api/referral/bookings/received] PATCH complete error:', completeError)
        return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
      }
      if (!completedRows || completedRows.length === 0) {
        return NextResponse.json({ error: 'not_confirmed' }, { status: 409 })
      }

      // ステージ4(送り手分配・CEO決定): 完了確定の直後に分配行を作成する(fail-soft・失敗しても完了処理自体は成功扱い)。
      try {
        await createReferralPayoutIfEligible(bookingId)
      } catch (payoutErr) {
        console.error('[api/referral/bookings/received] complete payout create error:', payoutErr)
      }

      // ライフサイクル改善(タスクD): 完了時、送り手プロへ通知する(失敗しても完了処理自体は成功扱い)。
      try {
        if (booking.sender_pro_id) {
          const { data: senderPro } = await supabase
            .from('professionals')
            .select('name, contact_email, line_messaging_user_id')
            .eq('id', booking.sender_pro_id)
            .maybeSingle()
          if (senderPro) {
            await notifyBookingCompletedToSender(
              {
                name: senderPro.name,
                contact_email: senderPro.contact_email,
                line_messaging_user_id: senderPro.line_messaging_user_id,
              },
              booking.clients?.nickname || 'クライアント',
              ownPro.name,
            )
          }
        }
      } catch (notifyErr) {
        console.error('[api/referral/bookings/received] complete sender notify error:', notifyErr)
      }

      return NextResponse.json({ success: true, status: 'completed' })
    }

    // タスクA(2026-08-04・CEO指示): 当日の場所をクライアントへ送信する。確定済み(支払い待ちでない)
    // カードから使う。入力値はDBに保存しない(メール送信という保存手段があるため)。
    if (action === 'send_location') {
      if (booking.status !== 'confirmed') {
        return NextResponse.json({ error: 'not_confirmed' }, { status: 409 })
      }
      if (paymentEnabled && booking.payment_status === 'awaiting') {
        return NextResponse.json({ error: 'payment_pending' }, { status: 409 })
      }
      const locationText = typeof body.location_text === 'string' ? body.location_text.trim().slice(0, 300) : ''
      if (!locationText) {
        return NextResponse.json({ error: 'location_required' }, { status: 400 })
      }

      const clientUserIdForLocation = booking.clients?.user_id || ''
      try {
        if (clientUserIdForLocation || booking.client_email) {
          await notifyLocationToClient(
            { userId: clientUserIdForLocation, email: booking.client_email },
            ownPro.name,
            locationText
          )
        }
      } catch (notifyErr) {
        console.error('[api/referral/bookings/received] send_location client notify error:', notifyErr)
      }

      // タスクA: チェックON時、professionals.addressが現に空の場合のみデフォルト保存する(上書き禁止)。
      if (body.save_as_default === true) {
        try {
          await supabase
            .from('professionals')
            .update({ address: locationText })
            .eq('id', ownPro.id)
            .is('address', null)
        } catch (addressErr) {
          console.error('[api/referral/bookings/received] send_location address save error:', addressErr)
        }
      }

      return NextResponse.json({ success: true })
    }

    // タスクB(2026-08-04・CEO指示): 確定後にプロ都合の日時変更を先に提案する(キャンセル前段)。
    // status='confirmed'のみ許可。counter_slots(requested時点の逆指定)とは別キー・再提案は上書き可。
    if (action === 'reschedule') {
      if (booking.status !== 'confirmed') {
        return NextResponse.json({ error: 'not_confirmed' }, { status: 409 })
      }
      // レビュー指摘(中1・send_locationと対称): フィー未払いの間は日時変更提案も出せない。
      if (paymentEnabled && booking.payment_status === 'awaiting') {
        return NextResponse.json({ error: 'payment_pending' }, { status: 409 })
      }
      // レビュー指摘(重大2a・counter_already_proposedと同種の事前チェック): 未回答の提案が
      // 残っている間(reschedule_slotsが1件以上 かつ reschedule_resolved_at無し)は再提案させない。
      const existingRescheduleSlots = booking.preferred_slots?.reschedule_slots
      if ((existingRescheduleSlots?.length || 0) > 0 && !booking.preferred_slots?.reschedule_resolved_at) {
        return NextResponse.json({ error: 'reschedule_already_proposed' }, { status: 409 })
      }

      const rawRescheduleSlots = Array.isArray(body.reschedule_slots) ? body.reschedule_slots : []
      // レビュー指摘(軽微2): 過去日時の提案を防ぐ。未来日時のみ採用する。
      const parsedRescheduleSlots = rawRescheduleSlots
        .map((s: unknown) => parseSlot(s))
        .filter((s: string | null): s is string => !!s)
        .filter((iso: string) => new Date(iso).getTime() > Date.now())
        .slice(0, 3)

      if (parsedRescheduleSlots.length === 0) {
        return NextResponse.json({ error: 'invalid_slots' }, { status: 400 })
      }

      const updatedSlotsForReschedule: PreferredSlots = {
        ...(booking.preferred_slots || {}),
        reschedule_slots: parsedRescheduleSlots,
        reschedule_proposed_at: new Date().toISOString(),
        reschedule_resolved_at: null,
        // レビュー指摘(軽微1): 新しいラウンド開始時、前回のkeep_currentマーカーを必ずクリアする
        // (クリアしないと前回「現在の日時を希望」だった表示が新ラウンド中も残ってしまう)。
        reschedule_kept_current_at: null,
      }

      const { data: updatedRescheduleRows, error: rescheduleError } = await supabase
        .from('referral_bookings')
        .update({ preferred_slots: updatedSlotsForReschedule })
        .eq('id', bookingId)
        .eq('status', 'confirmed')
        .select('id')

      if (rescheduleError) {
        console.error('[api/referral/bookings/received] PATCH reschedule error:', rescheduleError)
        return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
      }
      if (!updatedRescheduleRows || updatedRescheduleRows.length === 0) {
        return NextResponse.json({ error: 'not_confirmed' }, { status: 409 })
      }

      const clientUserIdForReschedule = booking.clients?.user_id || ''
      const currentConfirmedSlotIso = resolveConfirmedSlotIso(booking.preferred_slots)
      const currentSlotText = formatSlotWithWeekday(currentConfirmedSlotIso)
      const slugForReschedule = booking.referral_lists?.slug || ''
      const listUrlForReschedule = slugForReschedule ? `${APP_URL}/r/${slugForReschedule}` : APP_URL
      const bookingUrlForReschedule = `${APP_URL}/booking/${bookingId}`
      const slotTextsForReschedule = parsedRescheduleSlots
        .map((iso) => formatSlotWithWeekday(iso))
        .filter((t): t is string => !!t)

      // クライアントへ通知(失敗しても提案の保存自体は成功扱い)。送り手には通知しない
      // (進捗ノイズ・確定した時だけ通知する、というCEO決定)。
      try {
        if (clientUserIdForReschedule || booking.client_email) {
          await notifyRescheduleProposedToClient(
            { userId: clientUserIdForReschedule, email: booking.client_email },
            ownPro.name,
            slotTextsForReschedule,
            currentSlotText,
            bookingUrlForReschedule,
            listUrlForReschedule
          )
        }
      } catch (notifyErr) {
        console.error('[api/referral/bookings/received] reschedule client notify error:', notifyErr)
      }

      return NextResponse.json({ success: true, status: 'confirmed', reschedule_proposed: true })
    }

    // タスク①(2026-08-04・CEO指示): 支払い期限切れキャンセルカードの「閉じる」ボタン。
    // 行の物理削除はしない(決済・監査記録のため)。receiver_dismissed_atのみ記録する。
    if (action === 'dismiss_cancelled') {
      if (booking.status !== 'cancelled') {
        return NextResponse.json({ error: 'not_cancelled' }, { status: 409 })
      }
      const { data: dismissedRows, error: dismissError } = await supabase
        .from('referral_bookings')
        .update({ receiver_dismissed_at: new Date().toISOString() })
        .eq('id', bookingId)
        .eq('status', 'cancelled')
        .is('receiver_dismissed_at', null)
        .select('id')

      if (dismissError) {
        console.error('[api/referral/bookings/received] PATCH dismiss_cancelled error:', dismissError)
        return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
      }
      if (!dismissedRows || dismissedRows.length === 0) {
        return NextResponse.json({ error: 'already_dismissed' }, { status: 409 })
      }

      return NextResponse.json({ success: true })
    }

    // タスク②(2026-08-04・CEO指示): プロ都合キャンセル＋自動返金。確定済み(confirmed)のみ対象。
    // 実行順序(二重返金防止のため厳守): ①CASでキャンセル確定 → ②返金/決済リンク失効 → ③通知。
    // preferred_slotsにcancelled_by_receiver_atのマーカーを立てる理由: 支払期限切れ自動キャンセル
    // (cron)もpayment_status='canceled'を使うため、GET側のcancelled_unpaid一覧に混ざらないよう
    // このマーカーで区別する(既存のreschedule-respondと同じ ->> JSON path filter方式で除外する)。
    if (action === 'cancel_by_receiver') {
      // レビュー指摘(軽微3): preferred_slotsはPATCH冒頭で取得したスタレなスナップショットのため、
      // マーカー書き込み直前に再SELECTして最新値をベースにマージする(既存キーの消失リスクを縮小)。
      const { data: freshSlotsRow } = await supabase
        .from('referral_bookings')
        .select('preferred_slots')
        .eq('id', bookingId)
        .maybeSingle()
      const basePreferredSlots =
        (freshSlotsRow?.preferred_slots as PreferredSlots | null) || booking.preferred_slots || {}

      // CEO決定(2026-08-04・追加): クライアント都合キャンセルのセッション開始72時間前返金ルール。
      // レビュー指摘(重大3): 「クライアントから連絡を受けた日時」(client_requested_at・任意入力)が
      // 現在時刻より前ならそちらを基準にする(Math.min=より古い方=クライアントに有利な側を採用)。
      // 未指定・不正値は現在時刻のみを基準にする(現状動作と同じ)。
      // レビュー指摘(中5): 判定ロジックは単一情報源(referral-format.ts)の純関数に集約する。
      const confirmedSlotIsoForCancel = resolveConfirmedSlotIso(basePreferredSlots)
      const cancelBaseMs = clientRequestedAtMs !== null ? Math.min(clientRequestedAtMs, Date.now()) : Date.now()
      const withinClientRefundDeadline = isWithinClientRefundDeadline(confirmedSlotIsoForCancel, cancelBaseMs)
      // pro都合は常に全額返金。client都合はセッション開始72時間前ルール内のみ全額返金。
      const shouldRefundIfPaid = cancelReason === 'pro' || withinClientRefundDeadline
      const cancelReasonMarker: 'pro' | 'client_early' | 'client_late' =
        cancelReason === 'pro' ? 'pro' : withinClientRefundDeadline ? 'client_early' : 'client_late'

      // レビュー指摘(重大1): payment_statusもPATCH冒頭のスタレスナップショットのため、CASのUPDATE
      // 自体に`.select('id, payment_status')`を付け、更新確定と同時点の実値を取得して分岐する
      // (webhookの支払い完了と競合しても、この時点の実値で正しくpaid/awaitingを判定できる)。
      const cancelReturnSelect = paymentEnabled ? 'id, payment_status' : 'id'
      const { data: cancelRows, error: cancelUpdateError } = await supabase
        .from('referral_bookings')
        .update({
          status: 'cancelled',
          preferred_slots: {
            ...basePreferredSlots,
            cancelled_by_receiver_at: new Date().toISOString(),
            cancel_reason: cancelReasonMarker,
          },
        })
        .eq('id', bookingId)
        .eq('status', 'confirmed')
        .select(cancelReturnSelect)

      if (cancelUpdateError) {
        console.error('[api/referral/bookings/received] PATCH cancel_by_receiver error:', cancelUpdateError)
        return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
      }
      if (!cancelRows || cancelRows.length === 0) {
        return NextResponse.json({ error: 'not_confirmed' }, { status: 409 })
      }
      const paymentStatusAtCancel: string | null = paymentEnabled
        ? (cancelRows[0] as any).payment_status ?? null
        : null

      // ②返金/決済リンク失効(①のCASキャンセル確定が通った後にのみ実行する)
      const feeTotalBpsForRefund = booking.fee_total_bps ?? REFERRAL_FEE_TOTAL_BPS
      const fallbackAmountJpy =
        booking.price_jpy > 0 ? Math.floor((booking.price_jpy * feeTotalBpsForRefund) / 10000) : 0
      let refundedAmountJpy: number | null = null
      // レビュー指摘(重大2): paid確定(通常/競合再検出のいずれか)で返金を試みたが失敗した場合、
      // クライアント宛メールに「担当より別途ご連絡」を必ず入れるためのフラグ。
      let refundPending = false
      // CEO決定(2026-08-04・追加): client都合×セッション開始72時間前ルール外で「返金しない」と
      // 決めた場合の記録(システム障害のrefundPendingとは別。ポリシーどおりの正常系)。
      let noRefundByPolicy = false

      if (paymentEnabled) {
        if (paymentStatusAtCancel === 'paid') {
          if (shouldRefundIfPaid) {
            const refundResult = await refundReferralBookingFee({
              bookingId: booking.id,
              stripePaymentIntentId: booking.stripe_payment_intent_id,
              fallbackAmountJpy,
            })
            if (refundResult.refunded) {
              refundedAmountJpy = refundResult.amountJpy
            } else {
              refundPending = true
            }
            // 返金API呼び出し自体が失敗した場合はrefundReferralBookingFee内でCRITICALログ済み。
            // 返金失敗でもキャンセル自体は成立させる(fail open・①のCASは既に確定している)。
          } else {
            // client都合・セッション開始72時間前ルール外: 返金しない。payment_statusは'paid'のまま(返金なしの記録)。
            noRefundByPolicy = true
          }
        } else if (paymentStatusAtCancel === 'awaiting') {
          // 支払いは未確定のため返金は不要。決済リンクを失効させ、誰にも課金させない。
          const { data: awaitingCancelRows, error: awaitingCancelError } = await supabase
            .from('referral_bookings')
            .update({ payment_status: 'canceled' })
            .eq('id', bookingId)
            .eq('payment_status', 'awaiting')
            .select('id')
          if (awaitingCancelError) {
            console.error(
              '[api/referral/bookings/received] cancel_by_receiver awaiting payment_status update error:',
              awaitingCancelError
            )
          }
          if (!awaitingCancelError && (!awaitingCancelRows || awaitingCancelRows.length === 0)) {
            // レビュー指摘(重大1②): 0行=競合(その間にwebhookがpaidへ進めた可能性)。実状態を
            // 再SELECTし、'paid'であれば返金判定(shouldRefundIfPaid)に回す(課金されたまま
            // 返金なしになる穴を閉塞。client都合×セッション開始72時間前ルール外ならここでも返金しない)。
            const { data: latestPaymentRow } = await supabase
              .from('referral_bookings')
              .select('payment_status, stripe_payment_intent_id')
              .eq('id', bookingId)
              .maybeSingle()
            if (latestPaymentRow?.payment_status === 'paid') {
              if (shouldRefundIfPaid) {
                const refundResult = await refundReferralBookingFee({
                  bookingId: booking.id,
                  stripePaymentIntentId: latestPaymentRow.stripe_payment_intent_id,
                  fallbackAmountJpy,
                })
                if (refundResult.refunded) {
                  refundedAmountJpy = refundResult.amountJpy
                } else {
                  refundPending = true
                }
              } else {
                noRefundByPolicy = true
              }
            }
            // 'paid'以外(既にcanceled/refunded等)は他経路が処理済みのため何もしない。
          }
          if (booking.stripe_checkout_session_id) {
            await expireReferralCheckoutSession(booking.stripe_checkout_session_id)
          }
        }
        // 'not_required'/null/'unpaid'はpayment_statusを変更しない(そのままキャンセルのみ)。
      }

      // ③通知(失敗しても処理自体は成功扱い)
      const clientUserIdForCancel = booking.clients?.user_id || ''
      const clientNicknameForCancel = booking.clients?.nickname || 'クライアント'
      const slugForCancel = booking.referral_lists?.slug || ''
      const listUrlForCancel = slugForCancel ? `${APP_URL}/r/${slugForCancel}` : APP_URL
      // レビュー指摘(軽微9): クライアント宛メールに「◯◯さんとのご予約(確定日時)」を明記するため、
      // 呼び出し元(このルート)で確定日時を解決して渡す(通知関数側では再解決しない)。
      const confirmedSlotTextForCancel = formatSlotWithWeekday(confirmedSlotIsoForCancel)

      try {
        if (clientUserIdForCancel || booking.client_email) {
          await notifyBookingCancelledByReceiverToClient(
            { userId: clientUserIdForCancel, email: booking.client_email },
            ownPro.name,
            listUrlForCancel,
            {
              reason: cancelReason,
              refundedAmountJpy,
              refundPending,
              noRefundByPolicy,
              confirmedSlotText: confirmedSlotTextForCancel,
            }
          )
        }
      } catch (notifyErr) {
        console.error('[api/referral/bookings/received] cancel_by_receiver client notify error:', notifyErr)
      }

      try {
        if (booking.sender_pro_id) {
          const { data: senderPro } = await supabase
            .from('professionals')
            .select('name, contact_email, line_messaging_user_id')
            .eq('id', booking.sender_pro_id)
            .maybeSingle()
          if (senderPro) {
            await notifyBookingCancelledByReceiverToSender(
              {
                name: senderPro.name,
                contact_email: senderPro.contact_email,
                line_messaging_user_id: senderPro.line_messaging_user_id,
              },
              ownPro.name,
              clientNicknameForCancel,
              cancelReason,
            )
          }
        }
      } catch (notifyErr) {
        console.error('[api/referral/bookings/received] cancel_by_receiver sender notify error:', notifyErr)
      }

      return NextResponse.json({ success: true, status: 'cancelled' })
    }

    if (booking.status !== 'requested') {
      return NextResponse.json({ error: 'not_pending' }, { status: 409 })
    }
    if (booking.expires_at && new Date(booking.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'expired' }, { status: 409 })
    }

    const slug = booking.referral_lists?.slug || ''
    const listUrl = slug ? `${APP_URL}/r/${slug}` : APP_URL
    const clientUserId = booking.clients?.user_id || ''
    const clientNickname = booking.clients?.nickname || 'クライアント'

    if (action === 'decline') {
      const { error } = await supabase
        .from('referral_bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId)
        .eq('status', 'requested')

      if (error) {
        console.error('[api/referral/bookings/received] PATCH decline error:', error)
        return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
      }

      // クライアントへ通知(失敗しても処理自体は成功扱い)
      try {
        if (clientUserId || booking.client_email) {
          await notifyClientByEmail(
            { userId: clientUserId, email: booking.client_email },
            '今回はご希望に添えませんでした',
            emailShell(
              'ご相談について',
              `${escapeHtml(ownPro.name)}さんへのご相談は、今回はご希望に添えませんでした。<br>他の先生もご紹介できますので、よろしければご覧ください。`,
              '他の先生への相談はこちら',
              listUrl
            )
          )
        }
      } catch (notifyErr) {
        console.error('[api/referral/bookings/received] decline notify error:', notifyErr)
      }

      // 送り手プロへ通知(タスクD・失敗しても処理自体は成功扱い)
      try {
        if (booking.sender_pro_id) {
          const { data: senderPro } = await supabase
            .from('professionals')
            .select('name, contact_email, line_messaging_user_id')
            .eq('id', booking.sender_pro_id)
            .maybeSingle()
          if (senderPro) {
            await notifyBookingDeclinedToSender(
              {
                name: senderPro.name,
                contact_email: senderPro.contact_email,
                line_messaging_user_id: senderPro.line_messaging_user_id,
              },
              ownPro.name,
              clientNickname,
            )
          }
        }
      } catch (notifyErr) {
        console.error('[api/referral/bookings/received] decline sender notify error:', notifyErr)
      }

      return NextResponse.json({ success: true, status: 'cancelled' })
    }

    if (action === 'counter') {
      // レビューFAIL修正(軽微1): 再提案は1回まで(expires_atの無期限延長防止)。
      // UIは提案済み表示に切り替わるため隠れるが、直叩き対策として409で明示的に止める。
      if ((booking.preferred_slots?.counter_slots?.length || 0) > 0) {
        return NextResponse.json({ error: 'counter_already_proposed' }, { status: 409 })
      }

      // §2-4 bookings POSTのparseSlotと同等の+09:00補正を適用(datetime-local由来の文字列)
      const rawCounterSlots = Array.isArray(body.counter_slots) ? body.counter_slots : []
      const parsedCounterSlots = rawCounterSlots
        .map((s: unknown) => parseSlot(s))
        .filter((s: string | null): s is string => !!s)
        .slice(0, 3)

      if (parsedCounterSlots.length === 0) {
        return NextResponse.json({ error: 'counter_slot_required' }, { status: 400 })
      }

      const counterExpiresAt = new Date(Date.now() + COUNTER_EXPIRES_HOURS * 60 * 60 * 1000).toISOString()
      const updatedSlotsForCounter: PreferredSlots = {
        ...(booking.preferred_slots || {}),
        counter_slots: parsedCounterSlots,
        counter_proposed_at: new Date().toISOString(),
      }

      // レビュー指摘踏襲(重大1と同種): 0行(既に他経路がstatusを進めていた)は409で止める。
      const { data: updatedCounterRows, error: counterError } = await supabase
        .from('referral_bookings')
        .update({ preferred_slots: updatedSlotsForCounter, expires_at: counterExpiresAt })
        .eq('id', bookingId)
        .eq('status', 'requested')
        .select('id')

      if (counterError) {
        console.error('[api/referral/bookings/received] PATCH counter error:', counterError)
        return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
      }
      if (!updatedCounterRows || updatedCounterRows.length === 0) {
        return NextResponse.json({ error: 'not_pending' }, { status: 409 })
      }

      const bookingUrl = `${APP_URL}/booking/${bookingId}`
      const slotTexts = parsedCounterSlots
        .map((iso) => formatSlotWithWeekday(iso))
        .filter((t): t is string => !!t)

      // クライアントへ通知(失敗しても処理自体は成功扱い)
      try {
        if (clientUserId || booking.client_email) {
          await notifyCounterProposedToClient(
            { userId: clientUserId, email: booking.client_email },
            ownPro.name,
            slotTexts,
            bookingUrl,
            listUrl,
          )
        }
      } catch (notifyErr) {
        console.error('[api/referral/bookings/received] counter client notify error:', notifyErr)
      }

      // 送り手プロへ通知(クライアントの返答待ちであることを明示)
      try {
        if (booking.sender_pro_id) {
          const { data: senderPro } = await supabase
            .from('professionals')
            .select('name, contact_email, line_messaging_user_id')
            .eq('id', booking.sender_pro_id)
            .maybeSingle()
          if (senderPro) {
            await notifyBookingCounterProposedToSender(
              {
                name: senderPro.name,
                contact_email: senderPro.contact_email,
                line_messaging_user_id: senderPro.line_messaging_user_id,
              },
              ownPro.name,
              clientNickname,
            )
          }
        }
      } catch (notifyErr) {
        console.error('[api/referral/bookings/received] counter sender notify error:', notifyErr)
      }

      return NextResponse.json({ success: true, status: 'requested', counter_proposed: true })
    }

    // action === 'confirm'
    // レビューFAIL修正(中1): 既に別日時を提案済み(counter_slots実在)の間は、通常の3枠confirmを
    // 通さない(クライアントの返答を待たずに受け手が別の枠を確定できてしまう穴を閉塞)。
    if ((booking.preferred_slots?.counter_slots?.length || 0) > 0) {
      return NextResponse.json({ error: 'counter_pending' }, { status: 409 })
    }
    const slots = Array.isArray(booking.preferred_slots?.slots) ? booking.preferred_slots!.slots! : []
    if (confirmedIndex === null || confirmedIndex < 0 || confirmedIndex > 2 || !slots[confirmedIndex]) {
      return NextResponse.json({ error: 'invalid_slot_index' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()
    const updatedSlots: PreferredSlots = {
      ...(booking.preferred_slots || {}),
      confirmed_index: confirmedIndex,
    }

    // レビュー指摘(重大1): 二重confirm(同一予約への同時PATCH等)で、既に他経路がstatusを
    // requestedから進めていた場合は0行で返る。この場合は決済リンクもメールも一切出さずに409で止める。
    const { data: updatedConfirmRows, error: updateError } = await supabase
      .from('referral_bookings')
      .update({ status: 'confirmed', confirmed_at: nowIso, preferred_slots: updatedSlots })
      .eq('id', bookingId)
      .eq('status', 'requested')
      .select('id')

    if (updateError) {
      console.error('[api/referral/bookings/received] PATCH confirm error:', updateError)
      return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
    }
    if (!updatedConfirmRows || updatedConfirmRows.length === 0) {
      return NextResponse.json({ error: 'not_pending' }, { status: 409 })
    }

    const confirmedSlotText = formatSlot(slots[confirmedIndex])

    // §2-4ステージ3(予約フィー方式・CEO決定): 決済有効かつ未払い(payment_status==='unpaid')かつ
    // 予約フィーがStripeの最低決済額以上の場合のみ、確定と同時に予約フィー決済リンクを発行する。
    // この場合は「成立」ではなく「支払いのご案内」を送る(成立通知は支払い完了時にapplyReferralCheckoutSession
    // から送る。src/lib/referral-payment.ts参照)。
    const feeTotalBps = booking.fee_total_bps ?? REFERRAL_FEE_TOTAL_BPS
    const feeAmountJpy = booking.price_jpy > 0 ? Math.floor((booking.price_jpy * feeTotalBps) / 10000) : 0
    const shouldCollectFeePayment =
      paymentEnabled &&
      booking.payment_status === 'unpaid' &&
      booking.price_jpy > 0 &&
      feeAmountJpy >= REFERRAL_MIN_FEE_JPY

    let checkoutCreated = false
    if (shouldCollectFeePayment) {
      const slugForCheckout = booking.referral_lists?.slug || ''
      const listUrlForCheckout = slugForCheckout ? `${APP_URL}/r/${slugForCheckout}` : APP_URL

      // レビュー指摘(中1): 「決済リンク発行+メール送付」はconfirm時とcron再試行の両方から
      // 同じ関数を呼ぶ(src/lib/referral-payment.ts参照)。UPDATE 0行時はリンクを自動失効させる。
      const paymentResult = await issueFeePaymentLinkAndNotify({
        bookingId: booking.id,
        priceJpy: booking.price_jpy,
        feeAmountJpy,
        menuName: booking.pro_menus?.name || null,
        clientEmail: booking.client_email || null,
        clientUserId: clientUserId || null,
        receiverProName: ownPro.name,
        confirmedSlotText,
        successUrl: `${listUrlForCheckout}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        // バグ報告(2026-08-04)対応: キャンセル後の戻り先を予約ページに変更(再開の「お支払いに進む」ボタンがある)
        cancelUrl: `${APP_URL}/booking/${booking.id}?payment=canceled`,
        listUrl: listUrlForCheckout,
      })
      checkoutCreated = paymentResult.success
    }

    // 決済無効/対象外、または決済リンク発行に失敗した場合(fail open): 従来通り即時に
    // 「確定」を成立扱いで通知する(クライアント+送り手)。
    if (!checkoutCreated) {
      // クライアントへ通知(§2-4-6): 確定日時 + 受け手プロ名 + 送り手のlist.comment引用(§4-8 Phase1仮実装)
      try {
        if (clientUserId || booking.client_email) {
          const senderComment = booking.referral_lists?.comment
          const senderQuote = senderComment
            ? `<p style="margin-top:12px;color:#555;font-size:13px;line-height:1.7;">紹介元の先生からのメッセージ:<br>「${escapeHtml(senderComment)}」</p>`
            : ''
          const safeOwnProName = escapeHtml(ownPro.name)
          // CEO決定(2026-08-04): 成立時のクライアント宛メールに、受け手プロの場所・連絡先を自動掲載する。
          // レビュー重大2: 載せるのは「本当に決済対象外(not_required)」の成立時のみ。
          // 決済リンク発行失敗のfail open(後からcronが支払い案内を再送する)では開示しない。
          let accessHtml = ''
          let calendarHtml = ''
          let changeNoteHtml = ''
          if (!shouldCollectFeePayment) {
            const { data: receiverAccessInfo } = await supabase
              .from('professionals')
              .select(
                'address, nearest_station, walk_minutes, access_note, google_maps_url, booking_url, website_url, phone_number, contact_email'
              )
              .eq('id', ownPro.id)
              .maybeSingle()
            accessHtml = buildBookingLocationContactHtml(
              receiverAccessInfo || {
                address: null,
                nearest_station: null,
                walk_minutes: null,
                access_note: null,
                google_maps_url: null,
                booking_url: null,
                website_url: null,
                phone_number: null,
                contact_email: null,
              }
            )
            // ライフサイクル改善(タスクC・2026-08-04・CEO指示): 成立メールにGoogleカレンダー
            // 追加リンクと「変更は連絡先へ直接」の一文を添える。
            const slotIsoForCalendar = slots[confirmedIndex]
            const calendarUrl = slotIsoForCalendar
              ? buildGoogleCalendarUrl({
                  startIso: slotIsoForCalendar,
                  title: `${ownPro.name}さんとの紹介予約(REAL PROOF)`,
                  location: receiverAccessInfo?.address || undefined,
                })
              : null
            calendarHtml = buildCalendarLinkHtml(calendarUrl)
            changeNoteHtml = buildRescheduleContactNoteHtml(
              receiverAccessInfo || {
                booking_url: null,
                website_url: null,
                phone_number: null,
                contact_email: null,
              }
            )
          }
          await notifyClientByEmail(
            { userId: clientUserId, email: booking.client_email },
            `${ownPro.name}さんとのご紹介予約が確定しました`,
            emailShell(
              'ご相談確定のお知らせ',
              `${confirmedSlotText ? `${confirmedSlotText} に確定しました。` : 'ご相談の日時が確定しました。'}<br>担当: ${safeOwnProName}さん${senderQuote}${accessHtml}${calendarHtml}${changeNoteHtml}${referralListFooterHtml(listUrl)}`
            )
          )
        }
      } catch (notifyErr) {
        console.error('[api/referral/bookings/received] confirm client notify error:', notifyErr)
      }

      // 送り手プロへ通知(§4-8: 紹介成立の通知)
      try {
        if (booking.sender_pro_id) {
          const { data: senderPro } = await supabase
            .from('professionals')
            .select('name, contact_email, line_messaging_user_id')
            .eq('id', booking.sender_pro_id)
            .maybeSingle()

          if (senderPro) {
            await notifyBookingConfirmedToSender(
              {
                name: senderPro.name,
                contact_email: senderPro.contact_email,
                line_messaging_user_id: senderPro.line_messaging_user_id,
              },
              clientNickname,
              ownPro.name
            )
          }
        }
      } catch (notifyErr) {
        console.error('[api/referral/bookings/received] confirm sender notify error:', notifyErr)
      }
    }

    return NextResponse.json({ success: true, status: 'confirmed' })
  } catch (err: any) {
    console.error('[api/referral/bookings/received] PATCH error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
