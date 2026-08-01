import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { ensureOwnClient } from '@/lib/referral-auth'
import { verifyReceiverAllowedInList } from '@/lib/referral-data'
import { notifyBookingRequested } from '@/lib/referral-notify'

export const dynamic = 'force-dynamic'

/** §2-4: requested から48時間で自動失効 */
const BOOKING_EXPIRES_HOURS = 48
const MAX_THEME_LEN = 100
const MAX_NOTE_LEN = 500

/**
 * datetime-local由来のオフセット無し文字列("2026-08-05T14:00")はUTC環境で
 * パースすると9時間ズレる。オフセット/Zが既に付いている場合はそのまま、
 * 無い場合は Asia/Tokyo(+09:00) を明示付与してからパースする。
 */
function parseSlot(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const raw = value.trim()
  const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(raw)
  const withOffset = hasOffset ? raw : `${raw}+09:00`
  const d = new Date(withOffset)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/**
 * POST /api/referral/bookings
 * body: { list_id, receiver_pro_id, menu_id?, slot1, slot2?, slot3?, theme?, note?, info_share_consent }
 *
 * §4-2「登録は予約の瞬間のみ」: clients レコードが無い認証済みユーザーは、
 * ここで ensureOwnClient() によりその場で作成する。
 * ★ isReferralEnabled ではゲートしない(クライアント向け申込経路は非ゲートが仕様)。
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const listId = typeof body.list_id === 'string' ? body.list_id : ''
    const receiverProId = typeof body.receiver_pro_id === 'string' ? body.receiver_pro_id : ''
    const menuId = typeof body.menu_id === 'string' && body.menu_id ? body.menu_id : null
    const theme = typeof body.theme === 'string' ? body.theme.trim().slice(0, MAX_THEME_LEN) : ''
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_NOTE_LEN) : null
    const infoShareConsent = body.info_share_consent === true

    const slot1 = parseSlot(body.slot1)
    const slot2 = parseSlot(body.slot2)
    const slot3 = parseSlot(body.slot3)

    if (!listId || !receiverProId) {
      return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
    }
    if (!slot1) {
      return NextResponse.json({ error: 'slot1_required' }, { status: 400 })
    }
    if (!infoShareConsent) {
      return NextResponse.json({ error: 'consent_required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: list } = await supabase
      .from('referral_lists')
      .select('id, owner_id, slug, criteria')
      .eq('id', listId)
      .maybeSingle()

    if (!list) {
      return NextResponse.json({ error: 'list_not_found' }, { status: 404 })
    }

    // リストの候補(ピン+基準行・代理一段展開込み)に受け手が含まれるかを軽量検証
    // (Voice sanitize/強み集計まで走る getReferralPageData の丸ごと呼び出しは避ける)
    const allowed = await verifyReceiverAllowedInList(
      supabase,
      { id: list.id, criteria: list.criteria },
      receiverProId
    )
    if (!allowed) {
      return NextResponse.json({ error: 'receiver_not_in_list' }, { status: 400 })
    }

    const { data: receiverPro } = await supabase
      .from('professionals')
      .select('id, name, contact_email, line_messaging_user_id, accepting_status, deactivated_at')
      .eq('id', receiverProId)
      .maybeSingle()

    if (!receiverPro || receiverPro.deactivated_at) {
      return NextResponse.json({ error: 'receiver_not_found' }, { status: 404 })
    }
    if (receiverPro.accepting_status === 'closed') {
      return NextResponse.json({ error: 'receiver_not_accepting' }, { status: 409 })
    }

    let priceJpy = 0
    if (menuId) {
      const { data: menu } = await supabase
        .from('pro_menus')
        .select('id, professional_id, price_jpy, is_referral_bookable, is_active')
        .eq('id', menuId)
        .maybeSingle()

      if (
        !menu ||
        menu.professional_id !== receiverProId ||
        !menu.is_referral_bookable ||
        menu.is_active === false ||
        typeof menu.price_jpy !== 'number'
      ) {
        return NextResponse.json({ error: 'invalid_menu' }, { status: 400 })
      }
      priceJpy = menu.price_jpy
    }

    const ownClient = await ensureOwnClient(userId)
    if (!ownClient) {
      return NextResponse.json({ error: 'client_setup_failed' }, { status: 500 })
    }

    // 同一クライアント→同一受け手への未処理(requested)重複を防ぐ
    const { data: existingRequest } = await supabase
      .from('referral_bookings')
      .select('id')
      .eq('client_id', ownClient.id)
      .eq('receiver_pro_id', receiverProId)
      .eq('status', 'requested')
      .maybeSingle()

    if (existingRequest) {
      return NextResponse.json({ error: 'already_requested' }, { status: 409 })
    }

    const expiresAt = new Date(Date.now() + BOOKING_EXPIRES_HOURS * 60 * 60 * 1000).toISOString()

    const { data: booking, error } = await supabase
      .from('referral_bookings')
      .insert({
        list_id: list.id,
        sender_pro_id: list.owner_id,
        receiver_pro_id: receiverProId,
        client_id: ownClient.id,
        menu_id: menuId,
        theme_tags: theme ? [theme] : null,
        preferred_slots: { slots: [slot1, slot2, slot3], note: note || null },
        status: 'requested',
        price_jpy: priceJpy,
        info_share_consent: true,
        expires_at: expiresAt,
      })
      .select('id, status, expires_at')
      .maybeSingle()

    if (error) {
      // 部分UNIQUE(uniq_referral_bookings_requested)違反 = 同一受け手への申請が既に進行中
      if (error.code === '23505') {
        return NextResponse.json({ error: 'already_requested' }, { status: 409 })
      }
      console.error('[api/referral/bookings] POST insert error:', error)
      return NextResponse.json({ error: 'failed_to_create' }, { status: 500 })
    }

    // 受け手プロへの通知(失敗しても予約リクエスト自体は成功扱い)
    try {
      await notifyBookingRequested(
        {
          name: receiverPro.name,
          contact_email: receiverPro.contact_email,
          line_messaging_user_id: receiverPro.line_messaging_user_id,
        },
        ownClient.nickname || 'クライアント',
      )
    } catch (notifyErr) {
      console.error('[api/referral/bookings] notify error:', notifyErr)
    }

    return NextResponse.json({ booking })
  } catch (err: any) {
    console.error('[api/referral/bookings] POST error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
