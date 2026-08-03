import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'
import {
  notifyBookingConfirmedToSender,
  notifyClientByEmail,
  emailShell,
  escapeHtml,
} from '@/lib/referral-notify'
import { formatSlot } from '@/lib/referral-format'

export const dynamic = 'force-dynamic'

const APP_URL = 'https://realproof.jp'

interface PreferredSlots {
  slots?: (string | null)[]
  note?: string | null
  confirmed_index?: number
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
    const { data: bookings, error } = await supabase
      .from('referral_bookings')
      .select(
        'id, list_id, sender_pro_id, receiver_pro_id, client_id, menu_id, theme_tags, preferred_slots, status, price_jpy, expires_at, confirmed_at, completed_at, created_at, clients(id, nickname), referral_lists(id, slug, comment), pro_menus(name)'
      )
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
 * body: { booking_id, action: 'confirm' | 'decline' | 'complete', confirmed_index? }
 * 受け手プロ本人のみ操作可。confirm/decline は requested のみ、expires_at超過は409。
 * §2-4-7(決済なし版)/中11レビュー指摘: complete は confirmed のみ→completed。通知は不要
 * (Phase 2のプルーフ依頼パイプラインで扱う)。
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

    if (!bookingId || (action !== 'confirm' && action !== 'decline' && action !== 'complete')) {
      return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: bookingData } = await supabase
      .from('referral_bookings')
      .select(
        'id, list_id, sender_pro_id, receiver_pro_id, client_id, client_email, status, expires_at, preferred_slots, clients(id, user_id, nickname), referral_lists(id, slug, comment)'
      )
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
      const { error: completeError } = await supabase
        .from('referral_bookings')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', bookingId)
        .eq('status', 'confirmed')

      if (completeError) {
        console.error('[api/referral/bookings/received] PATCH complete error:', completeError)
        return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
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
              '他の先生を見る',
              listUrl
            )
          )
        }
      } catch (notifyErr) {
        console.error('[api/referral/bookings/received] decline notify error:', notifyErr)
      }

      return NextResponse.json({ success: true, status: 'cancelled' })
    }

    // action === 'confirm'
    const slots = Array.isArray(booking.preferred_slots?.slots) ? booking.preferred_slots!.slots! : []
    if (confirmedIndex === null || confirmedIndex < 0 || confirmedIndex > 2 || !slots[confirmedIndex]) {
      return NextResponse.json({ error: 'invalid_slot_index' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()
    const updatedSlots: PreferredSlots = {
      ...(booking.preferred_slots || {}),
      confirmed_index: confirmedIndex,
    }

    const { error: updateError } = await supabase
      .from('referral_bookings')
      .update({ status: 'confirmed', confirmed_at: nowIso, preferred_slots: updatedSlots })
      .eq('id', bookingId)
      .eq('status', 'requested')

    if (updateError) {
      console.error('[api/referral/bookings/received] PATCH confirm error:', updateError)
      return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
    }

    const confirmedSlotText = formatSlot(slots[confirmedIndex])

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
          `${ownPro.name}さんとのご相談が確定しました`,
          emailShell(
            'ご相談確定のお知らせ',
            `${confirmedSlotText ? `${confirmedSlotText} に確定しました。` : 'ご相談の日時が確定しました。'}<br>担当: ${safeOwnProName}さん${senderQuote}`
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

    return NextResponse.json({ success: true, status: 'confirmed' })
  } catch (err: any) {
    console.error('[api/referral/bookings/received] PATCH error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
