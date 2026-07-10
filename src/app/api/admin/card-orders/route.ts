/**
 * NFCカード注文（card_orders）一覧 — 管理者用
 *
 * GET /api/admin/card-orders
 * → 発送管理・ラベル出力のため、決済済み注文の宛先情報を新しい順で返す。
 *
 * 認証: admin cookie（rp_admin_auth=authenticated）。
 * card_orders は物販注文で、buyer 情報は運営が発送のために見る前提（votes の
 * voter_email 秘匿ルールとは別物）。
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get('rp_admin_auth')?.value === 'authenticated'
}

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('card_orders')
    .select('id, created_at, customer_name, email, shipping_address, amount, status, shipped_at, professional_id')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[admin/card-orders] query failed:', error.message)
    return NextResponse.json({ error: 'query failed' }, { status: 500 })
  }

  return NextResponse.json({ orders: data ?? [] })
}
