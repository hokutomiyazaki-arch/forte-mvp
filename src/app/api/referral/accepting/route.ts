import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'
import { isReferralEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

const ALLOWED_STATUS = ['open', 'conditional', 'closed']

/**
 * PATCH /api/referral/accepting
 * body: { accepting_status, accepting_note? }
 * §2-2 受け入れステータス。処方箋リストタブ内に置くため、他の処方箋APIと同様に
 * isReferralEnabled でゲートする（仮決定: タブ自体がフラグ配下のため整合を取った）。
 */
export async function PATCH(request: NextRequest) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!isReferralEnabled(ownPro.id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const acceptingStatus = body.accepting_status
    const acceptingNote = typeof body.accepting_note === 'string' ? body.accepting_note.trim() : null

    if (!ALLOWED_STATUS.includes(acceptingStatus)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 })
    }
    if (acceptingNote && acceptingNote.length > 200) {
      return NextResponse.json({ error: 'note_too_long' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('professionals')
      .update({
        accepting_status: acceptingStatus,
        accepting_note: acceptingStatus === 'conditional' ? acceptingNote : null,
        accepting_updated_at: new Date().toISOString(),
      })
      .eq('id', ownPro.id)
      .select('id, accepting_status, accepting_note, accepting_updated_at')
      .maybeSingle()

    if (error) {
      console.error('[api/referral/accepting] PATCH error:', error)
      return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
    }

    return NextResponse.json({ professional: data })
  } catch (err: any) {
    console.error('[api/referral/accepting] PATCH error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
