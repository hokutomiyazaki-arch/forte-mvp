import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'
import { notifyBookingMessage } from '@/lib/referral-notify'

export const dynamic = 'force-dynamic'

const MAX_BODY_LEN = 2000

interface BookingParticipants {
  id: string
  sender_pro_id: string | null
  receiver_pro_id: string
}

/** 参加者(送り手・受け手)本人のみアクセス可。それ以外(クライアント・第三者)は null を返す。 */
async function getBookingIfParticipant(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  bookingId: string,
  ownProId: string
): Promise<BookingParticipants | null> {
  const { data } = await supabase
    .from('referral_bookings')
    .select('id, sender_pro_id, receiver_pro_id')
    .eq('id', bookingId)
    .maybeSingle()

  if (!data) return null
  if (data.sender_pro_id !== ownProId && data.receiver_pro_id !== ownProId) return null
  return data as BookingParticipants
}

/**
 * GET /api/referral/bookings/[booking_id]/messages
 * 参加者(送り手・受け手)のみ閲覧可。completed/cancelled/expired後も閲覧可(記録として残す)。
 * 原文表示。AI変換(§2-6)は適用しない。
 * 自分宛ての未読(相手からのメッセージでread_at IS NULL)をここで既読化する。
 * ★ fail-soft: booking_messages テーブル未作成/取得失敗時は空配列を返す(ページを落とさない)。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { booking_id: string } }
) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const booking = await getBookingIfParticipant(supabase, params.booking_id, ownPro.id)
    if (!booking) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { data: messages, error } = await supabase
      .from('booking_messages')
      .select('id, booking_id, sender_pro_id, body, created_at, read_at')
      .eq('booking_id', params.booking_id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[api/referral/bookings/[booking_id]/messages] GET error (fail-soft):', error)
      return NextResponse.json({ messages: [] })
    }

    // 自分宛て(相手が送信者)の未読を既読化。失敗しても閲覧自体は成功扱い。
    try {
      const unreadIds = ((messages || []) as Array<{ id: string; sender_pro_id: string; read_at: string | null }>)
        .filter((m) => m.sender_pro_id !== ownPro.id && !m.read_at)
        .map((m) => m.id)
      if (unreadIds.length > 0) {
        await supabase
          .from('booking_messages')
          .update({ read_at: new Date().toISOString() })
          .in('id', unreadIds)
      }
    } catch (readErr) {
      console.error('[api/referral/bookings/[booking_id]/messages] mark-read error:', readErr)
    }

    return NextResponse.json({ messages: messages || [] })
  } catch (err: any) {
    console.error('[api/referral/bookings/[booking_id]/messages] GET error (fail-soft):', err)
    return NextResponse.json({ messages: [] })
  }
}

/**
 * POST /api/referral/bookings/[booking_id]/messages
 * body: { body: string }
 * 参加者(送り手・受け手)のみ投稿可。2000字上限。送信成功時に相手側プロへLINE通知(本文は載せない)。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { booking_id: string } }
) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const booking = await getBookingIfParticipant(supabase, params.booking_id, ownPro.id)
    if (!booking) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const requestBody = await request.json().catch(() => ({}))
    const messageBody = typeof requestBody.body === 'string' ? requestBody.body.trim() : ''
    if (!messageBody) {
      return NextResponse.json({ error: 'body_required' }, { status: 400 })
    }
    if (messageBody.length > MAX_BODY_LEN) {
      return NextResponse.json({ error: 'body_too_long' }, { status: 400 })
    }

    const { data: created, error } = await supabase
      .from('booking_messages')
      .insert({
        booking_id: params.booking_id,
        sender_pro_id: ownPro.id,
        body: messageBody,
      })
      .select('id, booking_id, sender_pro_id, body, created_at, read_at')
      .maybeSingle()

    if (error) {
      console.error('[api/referral/bookings/[booking_id]/messages] POST insert error:', error)
      return NextResponse.json({ error: 'failed_to_create' }, { status: 500 })
    }

    // 相手側プロへの通知(失敗しても投稿自体は成功扱い)。本文はLINE/メールに含めない。
    try {
      const otherProId = booking.sender_pro_id === ownPro.id ? booking.receiver_pro_id : booking.sender_pro_id
      if (otherProId) {
        const { data: otherPro } = await supabase
          .from('professionals')
          .select('name, contact_email, line_messaging_user_id')
          .eq('id', otherProId)
          .maybeSingle()

        if (otherPro) {
          await notifyBookingMessage(
            {
              name: otherPro.name,
              contact_email: otherPro.contact_email,
              line_messaging_user_id: otherPro.line_messaging_user_id,
            },
            ownPro.name,
          )
        }
      }
    } catch (notifyErr) {
      console.error('[api/referral/bookings/[booking_id]/messages] notify error:', notifyErr)
    }

    return NextResponse.json({ message: created })
  } catch (err: any) {
    console.error('[api/referral/bookings/[booking_id]/messages] POST error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
