import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro, MAX_REFERRAL_PINS_PER_LIST } from '@/lib/referral-auth'
import { isReferralEnabled } from '@/lib/feature-flags'
import { notifyReferralPinAdded } from '@/lib/referral-notify'

export const dynamic = 'force-dynamic'

async function getOwnedList(supabase: ReturnType<typeof getSupabaseAdmin>, listId: string, ownProId: string) {
  const { data } = await supabase
    .from('referral_lists')
    .select('id, owner_id')
    .eq('id', listId)
    .maybeSingle()
  if (!data || data.owner_id !== ownProId) return null
  return data
}

/**
 * POST /api/referral/lists/[list_id]/items
 * body: { pro_id, note? }
 * ピン指名を追加する。1リスト最大3名。consent_status='pending'で作成し、
 * 対象プロへ掲載通知を送る（通知失敗はピン追加の成否に影響しない）。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { list_id: string } }
) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!isReferralEnabled(ownPro.id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = getSupabaseAdmin()
    const list = await getOwnedList(supabase, params.list_id, ownPro.id)
    if (!list) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const proId = typeof body.pro_id === 'string' ? body.pro_id : ''
    const note = typeof body.note === 'string' ? body.note.trim() : null

    if (!proId) {
      return NextResponse.json({ error: 'pro_id_required' }, { status: 400 })
    }
    if (proId === ownPro.id) {
      return NextResponse.json({ error: 'self_pin_not_allowed' }, { status: 400 })
    }

    // 対象プロの存在確認（deactivatedは対象外）+ 通知先情報の取得
    const { data: targetPro } = await supabase
      .from('professionals')
      .select('id, name, contact_email, line_messaging_user_id, deactivated_at')
      .eq('id', proId)
      .maybeSingle()

    if (!targetPro || targetPro.deactivated_at) {
      return NextResponse.json({ error: 'target_pro_not_found' }, { status: 404 })
    }

    // 既存ピンの重複チェック
    const { data: existing } = await supabase
      .from('referral_list_items')
      .select('id')
      .eq('list_id', params.list_id)
      .eq('pro_id', proId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'already_pinned' }, { status: 409 })
    }

    // 1リスト最大3名チェック(中8レビュー指摘: declined=辞退者は枠を占有しないため除外)
    const { count } = await supabase
      .from('referral_list_items')
      .select('id', { count: 'exact', head: true })
      .eq('list_id', params.list_id)
      .neq('consent_status', 'declined')

    if ((count || 0) >= MAX_REFERRAL_PINS_PER_LIST) {
      return NextResponse.json({ error: 'max_pins_reached' }, { status: 400 })
    }

    const { data: item, error } = await supabase
      .from('referral_list_items')
      .insert({
        list_id: params.list_id,
        pro_id: proId,
        note,
        sort_order: count || 0,
        consent_status: 'pending',
      })
      .select('id, list_id, pro_id, note, sort_order, consent_status, created_at')
      .maybeSingle()

    if (error) {
      console.error('[api/referral/lists/[list_id]/items] POST insert error:', error)
      return NextResponse.json({ error: 'failed_to_create' }, { status: 500 })
    }

    // 掲載通知（失敗してもピン追加自体は成功扱い）
    try {
      await notifyReferralPinAdded(
        {
          name: targetPro.name,
          contact_email: targetPro.contact_email,
          line_messaging_user_id: targetPro.line_messaging_user_id,
        },
        ownPro.name,
      )
    } catch (notifyErr) {
      console.error('[api/referral/lists/[list_id]/items] notify error:', notifyErr)
    }

    return NextResponse.json({ item })
  } catch (err: any) {
    console.error('[api/referral/lists/[list_id]/items] POST error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}

/**
 * DELETE /api/referral/lists/[list_id]/items
 * body: { pro_id }
 * ピンを除去する。
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { list_id: string } }
) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!isReferralEnabled(ownPro.id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = getSupabaseAdmin()
    const list = await getOwnedList(supabase, params.list_id, ownPro.id)
    if (!list) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const proId = typeof body.pro_id === 'string' ? body.pro_id : ''
    if (!proId) {
      return NextResponse.json({ error: 'pro_id_required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('referral_list_items')
      .delete()
      .eq('list_id', params.list_id)
      .eq('pro_id', proId)

    if (error) {
      console.error('[api/referral/lists/[list_id]/items] DELETE error:', error)
      return NextResponse.json({ error: 'failed_to_delete' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[api/referral/lists/[list_id]/items] DELETE error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}

/**
 * PATCH /api/referral/lists/[list_id]/items
 * body: { pro_id, note?, sort_order? }
 * ピンの一言(note)・並び順を更新する。
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { list_id: string } }
) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!isReferralEnabled(ownPro.id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = getSupabaseAdmin()
    const list = await getOwnedList(supabase, params.list_id, ownPro.id)
    if (!list) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const proId = typeof body.pro_id === 'string' ? body.pro_id : ''
    if (!proId) {
      return NextResponse.json({ error: 'pro_id_required' }, { status: 400 })
    }

    const update: Record<string, any> = {}
    if (typeof body.note === 'string' || body.note === null) {
      update.note = typeof body.note === 'string' ? body.note.trim() : null
    }
    if (typeof body.sort_order === 'number') {
      update.sort_order = body.sort_order
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'no_fields_to_update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('referral_list_items')
      .update(update)
      .eq('list_id', params.list_id)
      .eq('pro_id', proId)
      .select('id, list_id, pro_id, note, sort_order, consent_status, created_at')
      .maybeSingle()

    if (error) {
      console.error('[api/referral/lists/[list_id]/items] PATCH error:', error)
      return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
    }

    return NextResponse.json({ item: data })
  } catch (err: any) {
    console.error('[api/referral/lists/[list_id]/items] PATCH error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
