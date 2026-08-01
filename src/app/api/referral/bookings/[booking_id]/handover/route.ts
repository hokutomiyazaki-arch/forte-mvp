import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'

export const dynamic = 'force-dynamic'

const MAX_FIELD_LEN = 1000

interface HandoverNote {
  theme: string
  history: string
  tried: string
  notes: string
}

function sanitizeField(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_FIELD_LEN) : ''
}

/**
 * PATCH /api/referral/bookings/[booking_id]/handover
 * body: { theme?, history?, tried?, notes? }
 * §2-10: 引き継ぎメモ(構造化)。送り手本人のみ記入/更新可。
 * クライアントの情報共有同意(§2-4④ info_share_consent=true)が無い予約は403。
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { booking_id: string } }
) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { data: booking, error: fetchError } = await supabase
      .from('referral_bookings')
      .select('id, sender_pro_id, info_share_consent, handover_note')
      .eq('id', params.booking_id)
      .maybeSingle()

    if (fetchError) {
      console.error('[api/referral/bookings/[booking_id]/handover] fetch error:', fetchError)
      return NextResponse.json({ error: 'failed_to_fetch' }, { status: 500 })
    }
    if (!booking) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (booking.sender_pro_id !== ownPro.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (!booking.info_share_consent) {
      return NextResponse.json({ error: 'consent_required' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const note: HandoverNote = {
      theme: sanitizeField(body.theme),
      history: sanitizeField(body.history),
      tried: sanitizeField(body.tried),
      notes: sanitizeField(body.notes),
    }

    const { data: updated, error: updateError } = await supabase
      .from('referral_bookings')
      .update({ handover_note: note })
      .eq('id', params.booking_id)
      .select('id, handover_note')
      .maybeSingle()

    if (updateError) {
      console.error('[api/referral/bookings/[booking_id]/handover] update error:', updateError)
      return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
    }

    return NextResponse.json({ handover_note: updated?.handover_note || note })
  } catch (err: any) {
    console.error('[api/referral/bookings/[booking_id]/handover] error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
