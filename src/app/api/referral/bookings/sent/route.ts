import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/referral/bookings/sent
 * §2-10: 送り手本人の成立予約(全ステータス)一覧。案件スレッド・引き継ぎメモの
 * 表示/編集の入口として使う。PIIはnicknameのみ(normalized_email等は含めない)。
 * ★ isReferralEnabled ではゲートしない(リスト作成後にフラグが変わっても既存予約は閲覧できる必要がある)。
 * ★ fail-soft: handover_note 列が未反映などで取得に失敗した場合は空配列を返す(ページを落とさない)。
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
        'id, list_id, receiver_pro_id, client_id, menu_id, theme_tags, status, price_jpy, handover_note, confirmed_at, completed_at, created_at, clients(id, nickname), pro_menus(name)'
      )
      .eq('sender_pro_id', ownPro.id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('[api/referral/bookings/sent] GET error (fail-soft):', error)
      return NextResponse.json({ bookings: [] })
    }

    const receiverIds = Array.from(
      new Set(((bookings || []) as any[]).map((b) => b.receiver_pro_id).filter(Boolean))
    )
    let receiversMap: Record<string, { id: string; name: string }> = {}
    if (receiverIds.length > 0) {
      const { data: receivers } = await supabase.from('professionals').select('id, name').in('id', receiverIds)
      for (const r of (receivers || []) as Array<{ id: string; name: string }>) {
        receiversMap[r.id] = r
      }
    }

    const result = ((bookings || []) as any[]).map((b) => ({
      id: b.id,
      list_id: b.list_id,
      menu_name: b.pro_menus?.name || null,
      theme_tags: b.theme_tags,
      status: b.status,
      price_jpy: b.price_jpy,
      handover_note: b.handover_note || null,
      confirmed_at: b.confirmed_at,
      completed_at: b.completed_at,
      created_at: b.created_at,
      client_nickname: b.clients?.nickname || 'クライアント',
      receiver_pro: b.receiver_pro_id ? receiversMap[b.receiver_pro_id] || null : null,
    }))

    return NextResponse.json({ bookings: result })
  } catch (err: any) {
    console.error('[api/referral/bookings/sent] GET error (fail-soft):', err)
    return NextResponse.json({ bookings: [] })
  }
}
