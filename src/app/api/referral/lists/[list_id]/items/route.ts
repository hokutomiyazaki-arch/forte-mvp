import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro, MAX_REFERRAL_PINS_PER_LIST } from '@/lib/referral-auth'
import { isReferralEnabled } from '@/lib/feature-flags'
import { notifyReferralPinAdded } from '@/lib/referral-notify'
import { computeReferralSignal } from '@/lib/referral-accepting'
import { getValidDelegateListIds } from '@/lib/referral-delegate'

export const dynamic = 'force-dynamic'

async function getOwnedList(supabase: ReturnType<typeof getSupabaseAdmin>, listId: string, ownProId: string) {
  const { data } = await supabase
    .from('referral_lists')
    .select('id, owner_id, visibility')
    .eq('id', listId)
    .maybeSingle()
  if (!data || data.owner_id !== ownProId) return null
  return data
}

/**
 * POST /api/referral/lists/[list_id]/items
 * body: { pro_id, note? }
 * ピン指名を追加する。1リスト最大3名。§3-0改訂(先行テスト第3弾): 承諾ゲートは無く、
 * consent_status='approved'で即時掲載(private=連携候補は'pending'固定・🟡7参照)。
 * §16-7改訂(2026-08-05・CEO決定): ピン追加できるのは🟢(open)のみ。🟡(delegate)も🔴(closed)も
 * 追加不可(🟡本人も紹介を受けられないためリストに載せるとクライアントが詰まる)。
 * またallowlist期間中に対象外のプロの場合は400でブロックする
 * (連携候補=privateリストは両方とも対象外)。掲載後、対象プロへ通知を送る（通知失敗はピン追加の成否に影響しない）。
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
      .select('id, name, contact_email, line_messaging_user_id, deactivated_at, accepting_status, delegate_list_id')
      .eq('id', proId)
      .maybeSingle()

    if (!targetPro || targetPro.deactivated_at) {
      return NextResponse.json({ error: 'target_pro_not_found' }, { status: 404 })
    }

    const isPrivateList = list.visibility === 'private'

    // ⚪️9レビュー指摘: 既存ピンの重複チェックは🔴/allowlist判定より先に行う。
    // ピン済み相手が後から停止中になったケースで409(already_pinned)を優先し、400を返さないため。
    const { data: existing } = await supabase
      .from('referral_list_items')
      .select('id')
      .eq('list_id', params.list_id)
      .eq('pro_id', proId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'already_pinned' }, { status: 409 })
    }

    // 🔴2レビュー指摘: allowlist(FEATURE_REFERRAL_LISTS)期間中、対象外のプロは受付トグルも
    // accepting APIも使えず辞退手段が無い。掲載対象もallowlist内のプロに限定する(b案)。
    // 'all'切替で自動的に全プロが対象になるため、その時点でこの制限は無効化される。
    // 連携候補(private・§3-1第1層)は通知なし・非公開のブックマークのため制限しない。
    if (!isPrivateList && !isReferralEnabled(targetPro.id)) {
      return NextResponse.json({ error: 'target_not_in_program' }, { status: 400 })
    }

    // §16-7改訂(2026-08-05・CEO決定): 掲載は即時（承諾ゲート撤廃）だが、相手が🟢(open)以外
    // ―つまり🟡(delegate)も🔴(closed)も―の場合はピン追加自体をブロックする。🟡本人も紹介を
    // 受けられないため、リストに載せるとクライアントが詰まる(🟡の役割は自分のカード単体の
    // 訪問者を認定者へ流すことであり、紹介リストの候補になることではない)。
    // 連携候補(private・§3-1第1層)は責任を伴わないブックマークのため対象外(従来通り通知もなし)。
    if (!isPrivateList) {
      const validDelegateListIds = await getValidDelegateListIds(supabase, [targetPro.delegate_list_id])
      const targetSignal = computeReferralSignal(
        targetPro.accepting_status,
        !!targetPro.delegate_list_id && validDelegateListIds.has(targetPro.delegate_list_id)
      )
      if (targetSignal !== 'open') {
        return NextResponse.json({ error: 'target_not_accepting' }, { status: 400 })
      }
    }

    // 1リスト最大3名チェック(中8レビュー指摘: declined=辞退者は枠を占有しないため除外)
    // ※連携候補(visibility='private'・§3-1第1層)は責任を伴わないブックマークのため人数無制限
    const { count } = await supabase
      .from('referral_list_items')
      .select('id', { count: 'exact', head: true })
      .eq('list_id', params.list_id)
      .neq('consent_status', 'declined')

    if (!isPrivateList && (count || 0) >= MAX_REFERRAL_PINS_PER_LIST) {
      return NextResponse.json({ error: 'max_pins_reached' }, { status: 400 })
    }

    // §3-0改訂(先行テスト第3弾・CEO決定): 承諾ゲート撤廃。ピン追加した時点で即時掲載
    // (consent_status='approved')。辞退は本人の受付トグルオフのみ（リスト単位の辞退機能は作らない）。
    // 🟡7レビュー指摘: private(連携候補)は無制限・無通知のため approved で入れると、後から
    // visibility を link に変えた瞬間に無承諾のまま一斉公開される穴になる。private は
    // pending 固定とする(表示系は consent_status='approved' 絞りのため公開されない)。
    const { data: item, error } = await supabase
      .from('referral_list_items')
      .insert({
        list_id: params.list_id,
        pro_id: proId,
        note,
        sort_order: count || 0,
        consent_status: isPrivateList ? 'pending' : 'approved',
      })
      .select('id, list_id, pro_id, note, sort_order, consent_status, created_at')
      .maybeSingle()

    if (error) {
      console.error('[api/referral/lists/[list_id]/items] POST insert error:', error)
      return NextResponse.json({ error: 'failed_to_create' }, { status: 500 })
    }

    // 掲載通知（失敗してもピン追加自体は成功扱い）
    // ※連携候補(private・§3-1第1層)は通知なし=個人的なブックマークのため
    if (isPrivateList) {
      return NextResponse.json({ item })
    }
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
