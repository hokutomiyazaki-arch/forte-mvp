/**
 * 認定「申請中」フラグのクリア（管理者操作）
 *
 * POST /api/admin/certification-card/pending  body: { proId }
 * → certification_pending.pending = false
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'
import { clearCertPending } from '@/lib/certification-card'

export const dynamic = 'force-dynamic'

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get('rp_admin_auth')?.value === 'authenticated'
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: { proId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  if (!body.proId) {
    return NextResponse.json({ error: 'proId required' }, { status: 400 })
  }
  await clearCertPending(getSupabaseAdmin(), body.proId)
  return NextResponse.json({ ok: true })
}
