import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { formatSlot, buildGoogleCalendarUrl } from '@/lib/referral-format'
import {
  notifyClientByEmail,
  notifyBookingConfirmedToSender,
  notifyCounterAcceptedToReceiver,
  referralListFooterHtml,
  emailShell,
  escapeHtml,
  buildBookingLocationContactHtml,
  buildCalendarLinkHtml,
  buildRescheduleContactNoteHtml,
} from '@/lib/referral-notify'
import { isReferralPaymentEnabled, REFERRAL_MIN_FEE_JPY, REFERRAL_FEE_TOTAL_BPS } from '@/lib/feature-flags'
// 中1レビュー指摘から継続: Stripe importはこのAPI routeに持たせない(Webpackチャンクグラフ対策)。
import { issueFeePaymentLinkAndNotify } from '@/lib/referral-payment'

export const dynamic = 'force-dynamic'

const APP_URL = 'https://realproof.jp'

/**
 * POST /api/referral/bookings/[booking_id]/accept
 * body: { slot_index }
 *
 * ライフサイクル改善(タスクB): クライアントが逆指定(counter_slots)の提案日時の中から
 * 1つを選んで承諾する。/booking/[booking_id] ページ(認証不要・秘匿URL)から呼ばれる。
 * ガード: status='requested' かつ counter_slots実在 かつ expires_at未達 かつ slot_index範囲内。
 * received PATCH confirm と同じ「0行→409」の二重confirm対策を踏襲する。
 * ★ isReferralEnabled ではゲートしない(クライアント向け経路は非ゲートが仕様)。
 */
export async function POST(request: NextRequest, { params }: { params: { booking_id: string } }) {
  try {
    const bookingId = params.booking_id
    if (!bookingId) {
      return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const slotIndex = typeof body.slot_index === 'number' ? body.slot_index : null

    const supabase = getSupabaseAdmin()
    const paymentEnabled = isReferralPaymentEnabled()
    const baseSelect =
      'id, list_id, sender_pro_id, receiver_pro_id, client_id, client_email, status, price_jpy, expires_at, preferred_slots, clients(id, user_id, nickname), referral_lists(id, slug), pro_menus(name)'
    const select = paymentEnabled ? `${baseSelect}, payment_status, fee_total_bps` : baseSelect

    const { data } = await supabase.from('referral_bookings').select(select).eq('id', bookingId).maybeSingle()
    const booking = data as any
    if (!booking) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    if (booking.status !== 'requested') {
      return NextResponse.json({ error: 'not_pending' }, { status: 409 })
    }
    if (booking.expires_at && new Date(booking.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'expired' }, { status: 409 })
    }

    const counterSlots: string[] = Array.isArray(booking.preferred_slots?.counter_slots)
      ? booking.preferred_slots.counter_slots.filter((s: unknown): s is string => typeof s === 'string')
      : []
    if (slotIndex === null || slotIndex < 0 || slotIndex >= counterSlots.length || !counterSlots[slotIndex]) {
      return NextResponse.json({ error: 'invalid_slot_index' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()
    const updatedSlots = {
      ...(booking.preferred_slots || {}),
      confirmed_counter_index: slotIndex,
    }

    // レビュー指摘踏襲(received PATCH confirmと同種): 0行(既に他経路がstatusを進めていた)は409で止める。
    const { data: updatedRows, error: updateError } = await supabase
      .from('referral_bookings')
      .update({ status: 'confirmed', confirmed_at: nowIso, preferred_slots: updatedSlots })
      .eq('id', bookingId)
      .eq('status', 'requested')
      .select('id')

    if (updateError) {
      console.error('[api/referral/bookings/[booking_id]/accept] update error:', updateError)
      return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
    }
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json({ error: 'not_pending' }, { status: 409 })
    }

    const confirmedSlotText = formatSlot(counterSlots[slotIndex])
    const slug = booking.referral_lists?.slug || ''
    const listUrl = slug ? `${APP_URL}/r/${slug}` : APP_URL
    const clientUserId = booking.clients?.user_id || ''
    const clientNickname = booking.clients?.nickname || 'クライアント'

    // CEO決定(2026-08-04): 成立時のクライアント宛メールに、受け手プロの場所・連絡先を自動掲載するため
    // アクセス情報カラムも合わせて取得する。
    const { data: receiverPro } = await supabase
      .from('professionals')
      .select(
        'name, contact_email, line_messaging_user_id, address, nearest_station, walk_minutes, access_note, google_maps_url, booking_url, website_url, phone_number'
      )
      .eq('id', booking.receiver_pro_id)
      .maybeSingle()
    const receiverProName = receiverPro?.name || 'プロ'

    const feeTotalBps = booking.fee_total_bps ?? REFERRAL_FEE_TOTAL_BPS
    const feeAmountJpy = booking.price_jpy > 0 ? Math.floor((booking.price_jpy * feeTotalBps) / 10000) : 0
    const shouldCollectFeePayment =
      paymentEnabled &&
      booking.payment_status === 'unpaid' &&
      booking.price_jpy > 0 &&
      feeAmountJpy >= REFERRAL_MIN_FEE_JPY

    let checkoutUrl: string | null = null
    if (shouldCollectFeePayment) {
      // レビュー指摘(中1)踏襲: 「決済リンク発行+メール送付」はreceived PATCH confirm・
      // cron再試行と同じ関数を呼ぶ(src/lib/referral-payment.ts参照)。
      const paymentResult = await issueFeePaymentLinkAndNotify({
        bookingId: booking.id,
        priceJpy: booking.price_jpy,
        feeAmountJpy,
        menuName: booking.pro_menus?.name || null,
        clientEmail: booking.client_email || null,
        clientUserId: clientUserId || null,
        receiverProName,
        confirmedSlotText,
        successUrl: `${listUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        // バグ報告(2026-08-04)対応: キャンセル後の戻り先を予約ページに変更(再開の「お支払いに進む」ボタンがある)
        cancelUrl: `${APP_URL}/booking/${booking.id}?payment=canceled`,
        listUrl,
      })
      if (paymentResult.success) {
        checkoutUrl = paymentResult.checkoutUrl
      }
    }

    // レビューFAIL修正(重大1): 受け手への「クライアントが日時を選択した」通知は、決済有無に
    // 関わらず必ず送る(受け手が確定日時を知る手段がここしかないため)。決済対象で支払い待ちの
    // 場合はawaitingPaymentで文言を分岐する(まだ「成立」ではないことを明示)。
    try {
      if (receiverPro) {
        await notifyCounterAcceptedToReceiver(
          {
            name: receiverPro.name,
            contact_email: receiverPro.contact_email,
            line_messaging_user_id: receiverPro.line_messaging_user_id,
          },
          clientNickname,
          confirmedSlotText,
          { awaitingPayment: !!checkoutUrl },
        )
      }
    } catch (notifyErr) {
      console.error('[api/referral/bookings/[booking_id]/accept] receiver notify error:', notifyErr)
    }

    // 決済無効/対象外、または決済リンク発行に失敗した場合(fail open): 即時に確定通知(クライアント+送り手)。
    // 決済対象の場合はissueFeePaymentLinkAndNotifyが既にクライアントへ支払い案内を送信済みのため、
    // ここでの二重送信はしない(送り手・クライアントの成立通知は支払い完了時に送る=既存フローと同じ)。
    if (!checkoutUrl) {
      try {
        if (clientUserId || booking.client_email) {
          const safeReceiverProName = escapeHtml(receiverProName)
          // レビュー重大2: 場所・連絡先を載せるのは「本当に決済対象外(not_required)」の成立時のみ。
          // 決済リンク発行失敗のfail open(後からcronが支払い案内を再送する)では開示しない。
          const accessHtml = !shouldCollectFeePayment
            ? buildBookingLocationContactHtml(
                receiverPro || {
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
            : ''
          // ライフサイクル改善(タスクC・2026-08-04・CEO指示): 成立メールにGoogleカレンダー
          // 追加リンクと「変更は連絡先へ直接」の一文を添える(場所・連絡先を載せる成立時のみ)。
          let calendarHtml = ''
          let changeNoteHtml = ''
          if (!shouldCollectFeePayment) {
            const calendarUrl = counterSlots[slotIndex]
              ? buildGoogleCalendarUrl({
                  startIso: counterSlots[slotIndex],
                  title: `${receiverProName}さんとのご相談(REAL PROOF)`,
                  location: receiverPro?.address || undefined,
                })
              : null
            calendarHtml = buildCalendarLinkHtml(calendarUrl)
            changeNoteHtml = buildRescheduleContactNoteHtml(
              receiverPro || {
                booking_url: null,
                website_url: null,
                phone_number: null,
                contact_email: null,
              }
            )
          }
          await notifyClientByEmail(
            { userId: clientUserId, email: booking.client_email },
            `${receiverProName}さんとのご予約が確定しました`,
            emailShell(
              'ご相談確定のお知らせ',
              `${confirmedSlotText ? `${confirmedSlotText} に確定しました。` : 'ご相談の日時が確定しました。'}<br>担当: ${safeReceiverProName}さん${accessHtml}${calendarHtml}${changeNoteHtml}${referralListFooterHtml(listUrl)}`
            )
          )
        }
      } catch (notifyErr) {
        console.error('[api/referral/bookings/[booking_id]/accept] client notify error:', notifyErr)
      }

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
              receiverProName,
            )
          }
        }
      } catch (notifyErr) {
        console.error('[api/referral/bookings/[booking_id]/accept] sender notify error:', notifyErr)
      }
    }

    return NextResponse.json({ success: true, status: 'confirmed', checkout_url: checkoutUrl })
  } catch (err: any) {
    console.error('[api/referral/bookings/[booking_id]/accept] error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
