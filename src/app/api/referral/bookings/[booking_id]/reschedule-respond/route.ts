import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { formatSlotWithWeekday, buildGoogleCalendarUrl, resolveConfirmedSlotIso } from '@/lib/referral-format'
import {
  notifyRescheduleConfirmedToReceiver,
  notifyRescheduleKeptCurrentToReceiver,
  notifyRescheduleConfirmedToClient,
} from '@/lib/referral-notify'

export const dynamic = 'force-dynamic'

const APP_URL = 'https://realproof.jp'

/**
 * POST /api/referral/bookings/[booking_id]/reschedule-respond
 * body: { mode: 'select', slot_iso } | { mode: 'keep_current' }
 *
 * ライフサイクル改善(タスクB・2026-08-04・CEO指示): 確定後にプロが提案した日時変更に対し、
 * クライアントが「その日時を選ぶ」or「現在の日時のまま」を選択する。/booking/[booking_id]
 * (認証不要・秘匿URL)から呼ばれる。既存の accept route(逆指定承諾)と同じガード方針を踏襲する
 * (status='confirmed'のみ許可・0行更新は409。preferred_slotsのjsonb部分状態は、
 * counter系と同じ「事前チェック+status guardのUPDATE」方式で二重処理を防ぐ)。
 */
export async function POST(request: NextRequest, { params }: { params: { booking_id: string } }) {
  try {
    const bookingId = params.booking_id
    if (!bookingId) {
      return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const mode = body.mode === 'keep_current' ? 'keep_current' : body.mode === 'select' ? 'select' : null
    // レビュー指摘(重大2b): indexではなくslot_iso(ISO文字列)で受け取る(index方式は保存済み
    // reschedule_slotsとの取得順ズレで誤確定するリスクがあるため)。
    const slotIso = typeof body.slot_iso === 'string' ? body.slot_iso : null
    if (!mode) {
      return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from('referral_bookings')
      .select(
        'id, sender_pro_id, receiver_pro_id, client_id, client_email, status, preferred_slots, clients(id, user_id, nickname), referral_lists(id, slug)'
      )
      .eq('id', bookingId)
      .maybeSingle()

    const booking = data as any
    if (!booking) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (booking.status !== 'confirmed') {
      return NextResponse.json({ error: 'not_confirmed' }, { status: 409 })
    }

    const rescheduleSlots: string[] = Array.isArray(booking.preferred_slots?.reschedule_slots)
      ? booking.preferred_slots.reschedule_slots.filter((s: unknown): s is string => typeof s === 'string')
      : []
    if (rescheduleSlots.length === 0) {
      return NextResponse.json({ error: 'no_proposal' }, { status: 404 })
    }
    // 直叩き・二重送信対策(既存counter系のcounter_already_proposedと同じ事前チェック方式。
    // preferred_slotsはjsonbのため真のDBレベルCASではなく、status guard付きUPDATEと組み合わせる)。
    if (booking.preferred_slots?.reschedule_resolved_at) {
      return NextResponse.json({ error: 'already_resolved' }, { status: 409 })
    }

    let selectedIso: string | null = null
    if (mode === 'select') {
      // レビュー指摘(重大2b): 保存済みreschedule_slotsに完全一致で含まれることを要求する
      // (indexずれによる誤確定防止)。
      if (!slotIso || !rescheduleSlots.includes(slotIso)) {
        return NextResponse.json({ error: 'invalid_slot' }, { status: 400 })
      }
      selectedIso = slotIso
    }

    const nowIso = new Date().toISOString()
    const updatedSlots = {
      ...(booking.preferred_slots || {}),
      reschedule_slots: null,
      reschedule_resolved_at: nowIso,
      // レビュー指摘(軽微1): confirmed_slot_isoは他ラウンドでも残り続けるため、単独では
      // 「今回keep_currentを選んだか」を判別できない。このラウンドの結果を都度明示的に
      // セット/nullで上書きする専用マーカーとする(2周目以降の偽陰性/偽陽性を防ぐ)。
      reschedule_kept_current_at: mode === 'keep_current' ? nowIso : null,
      ...(mode === 'select' ? { confirmed_slot_iso: selectedIso } : {}),
    }

    // レビュー指摘(軽微1): 事前チェックだけでなくUPDATE自体をCASにする(preferred_slots->>
    // reschedule_resolved_atがnullの行のみ更新対象にし、二重通知を防ぐ)。
    const { data: updatedRows, error: updateError } = await supabase
      .from('referral_bookings')
      .update({ preferred_slots: updatedSlots })
      .eq('id', bookingId)
      .eq('status', 'confirmed')
      .filter('preferred_slots->>reschedule_resolved_at', 'is', null)
      .select('id')

    if (updateError) {
      console.error('[api/referral/bookings/[booking_id]/reschedule-respond] update error:', updateError)
      return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
    }
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json({ error: 'already_resolved' }, { status: 409 })
    }

    const clientNickname = booking.clients?.nickname || 'クライアント'
    const clientUserId = booking.clients?.user_id || ''
    const slug = booking.referral_lists?.slug || ''
    const listUrl = slug ? `${APP_URL}/r/${slug}` : APP_URL

    const { data: receiverPro } = await supabase
      .from('professionals')
      .select('name, contact_email, line_messaging_user_id, address')
      .eq('id', booking.receiver_pro_id)
      .maybeSingle()
    const receiverProName = receiverPro?.name || 'プロ'

    // CEO報告(2026-08-08): 直予約に「予約金は全額返金」「紹介予約」の文言を出さないため source を判定する。
    // received/route.ts と同じ作法: 本体SELECTに source を足すと migration 056 未実行環境で
    // 42703 になり操作全体が落ちるため、別クエリ + fail-soft(失敗時は紹介予約扱い)で取得する。
    // レビュー指摘(2026-08-08・中3): 失敗は握りつぶさず必ずログに残す(42703はthrowせずerrorで返るため
    // dataだけ見ると痕跡ゼロになる)。keep_current のメール文言と select のカレンダータイトルで共用。
    let isDirectBooking = false
    try {
      const { data: sourceRow, error: sourceError } = await supabase
        .from('referral_bookings')
        .select('source')
        .eq('id', bookingId)
        .maybeSingle()
      if (sourceError) {
        console.error('[api/referral/bookings/[booking_id]/reschedule-respond] source fetch error (fail-soft):', sourceError)
      }
      isDirectBooking = (sourceRow as { source?: string | null } | null)?.source === 'direct'
    } catch (sourceErr) {
      console.error('[api/referral/bookings/[booking_id]/reschedule-respond] source fetch error (fail-soft):', sourceErr)
    }

    if (mode === 'keep_current') {
      // §2-2改訂(CEO決定): 「現在の日時のまま」の場合は受け手のみ通知(送り手は成立時のみ通知)。
      // CEO指摘(2026-08-04): 通知文にどの日時を希望しているかを含めるため、更新前のpreferred_slots
      // (confirmed_index/confirmed_counter_index。keep_currentではconfirmed_slot_isoは設定しない)
      // から現在の確定日時を解決する。
      const currentSlotIsoForKeep = resolveConfirmedSlotIso(booking.preferred_slots)
      const currentSlotTextForKeep = formatSlotWithWeekday(currentSlotIsoForKeep)
      try {
        if (receiverPro) {
          await notifyRescheduleKeptCurrentToReceiver(
            {
              name: receiverPro.name,
              contact_email: receiverPro.contact_email,
              line_messaging_user_id: receiverPro.line_messaging_user_id,
            },
            clientNickname,
            currentSlotTextForKeep,
            isDirectBooking,
            bookingId
          )
        }
      } catch (notifyErr) {
        console.error(
          '[api/referral/bookings/[booking_id]/reschedule-respond] keep_current receiver notify error:',
          notifyErr
        )
      }
      return NextResponse.json({ success: true, status: 'confirmed', mode: 'keep_current' })
    }

    // mode === 'select': 受け手+送り手+クライアントの3者へ新日時を通知する。
    const newSlotText = formatSlotWithWeekday(selectedIso)

    try {
      if (receiverPro) {
        await notifyRescheduleConfirmedToReceiver(
          {
            name: receiverPro.name,
            contact_email: receiverPro.contact_email,
            line_messaging_user_id: receiverPro.line_messaging_user_id,
          },
          clientNickname,
          newSlotText,
          bookingId
        )
      }
    } catch (notifyErr) {
      console.error('[api/referral/bookings/[booking_id]/reschedule-respond] receiver notify error:', notifyErr)
    }

    // CEO指示(2026-08-05): 送り手プロ宛の日時変更確定通知は削減(クリティカルな結果のみに絞る)。
    // 受け手・クライアント宛は維持する。

    try {
      if (clientUserId || booking.client_email) {
        const calendarUrl = selectedIso
          ? buildGoogleCalendarUrl({
              startIso: selectedIso,
              // レビュー指摘(2026-08-08・軽微): 直予約に「紹介予約」とタイトルを付けない。
              title: isDirectBooking
                ? `${receiverProName}さんとのご予約(REAL PROOF)`
                : `${receiverProName}さんとの紹介予約(REAL PROOF)`,
              location: receiverPro?.address || undefined,
            })
          : null
        await notifyRescheduleConfirmedToClient(
          { userId: clientUserId, email: booking.client_email },
          receiverProName,
          newSlotText,
          listUrl,
          calendarUrl
        )
      }
    } catch (notifyErr) {
      console.error('[api/referral/bookings/[booking_id]/reschedule-respond] client notify error:', notifyErr)
    }

    return NextResponse.json({ success: true, status: 'confirmed', mode: 'select' })
  } catch (err: any) {
    console.error('[api/referral/bookings/[booking_id]/reschedule-respond] error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
