/**
 * 認定賞状 — 送付済みトグル（管理者操作）
 *
 * POST /api/admin/certification-card/ship
 *   body: { proId, proofId, shipped }
 * → certificates を upsert。shipped=true かつ未申請・未採番なら認定番号を採番。
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'
import { setCertificateShipped } from '@/lib/certification-card'

export const dynamic = 'force-dynamic'

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get('rp_admin_auth')?.value === 'authenticated'
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: { proId?: string; proofId?: string; shipped?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  const { proId, proofId, shipped } = body
  if (!proId || !proofId || typeof shipped !== 'boolean') {
    return NextResponse.json({ error: 'proId, proofId, shipped required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const result = await setCertificateShipped(supabase, proId, proofId, shipped)
  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'failed' }, { status: 400 })
  }
  return NextResponse.json({
    ok: true,
    proofId: result.proofId,
    shipped: result.shipped,
    certNumber: result.certNumber,
    tier: result.tier,
  })
}
