import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'

export const dynamic = 'force-dynamic'

const ALLOWED_CONSENT = ['approved', 'declined']

/**
 * GET /api/referral/consents
 * 自分（載せられた側）が pending/approved の状態で載っているリスト項目を返す。
 * ★ isReferralEnabled ではゲートしない（掲載可否の操作は先行アクセス外のプロにも必要な権利のため）。
 */
export async function GET() {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('referral_list_items')
      .select('id, list_id, note, consent_status, created_at, referral_lists(id, title, owner_id, professionals(id, name, photo_url))')
      .eq('pro_id', ownPro.id)
      .in('consent_status', ['pending', 'approved'])
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[api/referral/consents] GET error:', error)
      return NextResponse.json({ error: 'failed_to_fetch' }, { status: 500 })
    }

    return NextResponse.json({ items: data || [] })
  } catch (err: any) {
    console.error('[api/referral/consents] GET error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}

/**
 * PATCH /api/referral/consents
 * body: { item_id, consent_status: 'approved' | 'declined' }
 * 載せられた側本人のみ操作可。
 */
export async function PATCH(request: NextRequest) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const itemId = typeof body.item_id === 'string' ? body.item_id : ''
    const consentStatus = body.consent_status

    if (!itemId || !ALLOWED_CONSENT.includes(consentStatus)) {
      return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: item } = await supabase
      .from('referral_list_items')
      .select('id, pro_id')
      .eq('id', itemId)
      .maybeSingle()

    if (!item || item.pro_id !== ownPro.id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('referral_list_items')
      .update({ consent_status: consentStatus })
      .eq('id', itemId)
      .select('id, list_id, pro_id, note, consent_status, created_at')
      .maybeSingle()

    if (error) {
      console.error('[api/referral/consents] PATCH error:', error)
      return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
    }

    return NextResponse.json({ item: data })
  } catch (err: any) {
    console.error('[api/referral/consents] PATCH error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
