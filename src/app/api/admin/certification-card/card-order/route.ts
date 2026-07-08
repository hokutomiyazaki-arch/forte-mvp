/**
 * カード「業者へ発注完了」フラグの切替（管理者操作）
 *
 * POST /api/admin/certification-card/card-order  body: { proId, ordered }
 * → certification_pending.card_ordered_at = now()（ordered=true） / null（false）
 *   これで miteca 等への発注が済んだかを管理画面で追える。
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'
import { setCardOrdered } from '@/lib/certification-card'

export const dynamic = 'force-dynamic'

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get('rp_admin_auth')?.value === 'authenticated'
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: { proId?: string; ordered?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  if (!body.proId) {
    return NextResponse.json({ error: 'proId required' }, { status: 400 })
  }
  const cardOrderedAt = await setCardOrdered(getSupabaseAdmin(), body.proId, body.ordered === true)
  return NextResponse.json({ ok: true, cardOrderedAt })
}
