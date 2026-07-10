/**
 * NFCカード注文 — 発送状態トグル（管理者操作）
 *
 * POST /api/admin/card-orders/ship
 *   body: { orderId: string, shipped: boolean }
 * → card_orders.status / shipped_at を更新。
 *   shipped=true  → status='shipped', shipped_at=now()
 *   shipped=false → status='paid',    shipped_at=null（チェック外し＝取り消し対応）
 *
 * 認証: admin cookie（rp_admin_auth=authenticated）。手本は certification-card/ship。
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get('rp_admin_auth')?.value === 'authenticated'
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { orderId?: string; shipped?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  const { orderId, shipped } = body
  if (!orderId || typeof shipped !== 'boolean') {
    return NextResponse.json({ error: 'orderId, shipped required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // UPDATE 前に対象の存在を確認（無ければ 404）
  const { data: existing, error: findError } = await supabase
    .from('card_orders')
    .select('id')
    .eq('id', orderId)
    .maybeSingle()

  if (findError) {
    console.error('[admin/card-orders/ship] lookup failed:', findError.message)
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: 'order not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('card_orders')
    .update({
      status: shipped ? 'shipped' : 'paid',
      shipped_at: shipped ? new Date().toISOString() : null,
    })
    .eq('id', orderId)
    .select('id, status, shipped_at')
    .maybeSingle()

  if (error) {
    console.error('[admin/card-orders/ship] update failed:', error.message)
    return NextResponse.json({ error: 'update failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, order: data })
}
