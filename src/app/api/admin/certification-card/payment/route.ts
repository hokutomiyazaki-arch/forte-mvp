/**
 * 入金状況の手動更新（管理者操作）
 *
 * POST /api/admin/certification-card/payment  body: { proId, paid }
 * → certification_applications.payment_status を pending⇄paid で切替。
 *
 * Stripe Webhook 導入前の決済・銀行振込・過去分の補正用。ロジックは setApplicationsPaid に集約。
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'
import { setApplicationsPaid } from '@/lib/certification-card'

export const dynamic = 'force-dynamic'

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get('rp_admin_auth')?.value === 'authenticated'
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: { proId?: string; paid?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  if (!body.proId || typeof body.paid !== 'boolean') {
    return NextResponse.json({ error: 'proId and paid required' }, { status: 400 })
  }

  const result = await setApplicationsPaid(getSupabaseAdmin(), body.proId, body.paid)
  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'update_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, updated: result.updated })
}
