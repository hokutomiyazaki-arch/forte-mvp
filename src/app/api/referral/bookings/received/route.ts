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
} from '@/lib/referral-notify'
import { formatSlot, formatSlotWithWeekday, parseSlot } from '@/lib/referral-format'
import { isReferralPaymentEnabled, REFERRAL_MIN_FEE_JPY } from '@/lib/feature-flags'
// 中1レビュー指摘から継続: Stripe importはこのAPI routeに持たせない(Webpackチャンクグラフ対策)。
// Checkout Session作成+メール送付(共通処理)はsrc/lib/referral-payment.tsの関数呼び出しに委譲する。
import { issueFeePaymentLinkAndNotify } from '@/lib/referral-payment'

export const dynamic = 'force-dynamic'

const APP_URL = 'https://realproof.jp'
/** §2-4ステージ3(予約フィー方式)のフォールバック用。通常は保存済みの fee_total_bps を使う。 */
const DEFAULT_FEE_TOTAL_BPS = 3360
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
}

/**
 * PII注意: clients.user_id / client_email はメール送信にのみ使う。レスポンスには絶対含めない。
 * client_name/client_phone は§2-4ステージ1で開示制御対象(受け手への開示は別ステージで実装)のため、
 * この一覧取得では select しない。
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
  expires_at: string | null
  confirmed_at: string | null
  completed_at: string | null
  created_at: string
  clients: { id: string; user_id: string; nickname: string } | null
  referral_lists: { id: string; slug: string; comment: string | null } | null
  pro_menus: { name: string } | null
}

/**
 * GET /api/referral/bookings/received
 * 受け手プロ本人の requested/confirmed 一覧。クライアントは nickname のみ(PII含めない)。
 * ★ isReferralEnabled ではゲートしない(受け手は先行アクセス外でもリクエストを受けられる必要がある)。
 * タスク⑥: レスポンスに `completed`(completed_at desc・limit 200)を追加。既存の `bookings` の形は変更しない。
 */
export async function GET() {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    // §2-4ステージ3(予約フィー方式): payment_statusはmigration 036依存のカラムのため、
    // 既存の他ファイル(cron/expire-referral-bookings等)と同様にフラグゲート付きで選択する。
    // 受け手APIへの追加はstatusのみ(金額・連絡先はここでは選択しない)。
    const paymentEnabled = isReferralPaymentEnabled()
    const baseBookingSelect =
      'id, list_id, sender_pro_id, receiver_pro_id, client_id, menu_id, theme_tags, preferred_slots, status, price_jpy, expires_at, confirmed_at, completed_at, created_at, clients(id, nickname), referral_lists(id, slug, comment), pro_menus(name)'
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
      const { data: completedRows, error: completedError } = await supabase
        .from('referral_bookings')
        .select(
          'id, list_id, sender_pro_id, receiver_pro_id, client_id, menu_id, theme_tags, status, price_jpy, handover_note, confirmed_at, completed_at, created_at, clients(id, nickname), pro_menus(name)'
        )
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
      // §2-4ステージ3: 決済有効時のみpayment_status(状態のみ)を返す。金額・連絡先は含めない。
      payment_status: paymentEnabled ? b.payment_status || null : null,
      handover_note: handoverMap[b.id] || null,
      expires_at: b.expires_at,
      confirmed_at: b.confirmed_at,
      created_at: b.created_at,
      client_nickname: b.clients?.nickname || 'クライアント',
      sender_pro: b.sender_pro_id ? sendersMap[b.sender_pro_id] || null : null,
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
    }))

    return NextResponse.json({ bookings: result, completed: completedResult })
  } catch (err: any) {
    console.error('[api/referral/bookings/received] GET error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}

/**
 * PATCH /api/referral/bookings/received
 * body: { booking_id, action: 'confirm' | 'decline' | 'complete' | 'counter', confirmed_index?, counter_slots? }
 * 受け手プロ本人のみ操作可。confirm/decline/counter は requested のみ、expires_at超過は409。
 * §2-4-7(決済なし版)/中11レビュー指摘: complete は confirmed のみ→completed。
 * ライフサイクル改善(タスクA・逆指定): counter は、受け手が別日時を提案する。requestedのまま
 * preferred_slots.counter_slots に保存し、expires_atを48hリセットする(クライアントの返答待ち)。
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

    if (
      !bookingId ||
      (action !== 'confirm' && action !== 'decline' && action !== 'complete' && action !== 'counter')
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
    const confirmSelect = paymentEnabled ? `${baseConfirmSelect}, payment_status, fee_total_bps` : baseConfirmSelect
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
      const { error: completeError } = await supabase
        .from('referral_bookings')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', bookingId)
        .eq('status', 'confirmed')

      if (completeError) {
        console.error('[api/referral/bookings/received] PATCH complete error:', completeError)
        return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
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
            )
          }
        }
      } catch (notifyErr) {
        console.error('[api/referral/bookings/received] complete sender notify error:', notifyErr)
      }

      return NextResponse.json({ success: true, status: 'completed' })
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
    const feeTotalBps = booking.fee_total_bps ?? DEFAULT_FEE_TOTAL_BPS
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
        cancelUrl: `${listUrlForCheckout}?payment=canceled&session_id={CHECKOUT_SESSION_ID}`,
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
          await notifyClientByEmail(
            { userId: clientUserId, email: booking.client_email },
            `${ownPro.name}さんとのご予約が確定しました`,
            emailShell(
              'ご相談確定のお知らせ',
              `${confirmedSlotText ? `${confirmedSlotText} に確定しました。` : 'ご相談の日時が確定しました。'}<br>担当: ${safeOwnProName}さん${senderQuote}${referralListFooterHtml(listUrl)}`
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
