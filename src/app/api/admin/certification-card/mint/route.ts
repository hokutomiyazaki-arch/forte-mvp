/**
 * 新規 card_uid の発番（mint・管理者操作・§16・🛑CEO承認後）
 *
 * POST /api/admin/certification-card/mint  body: { proId }
 * → 本人専用の card_uid を1つ生成し nfc_cards に作成。既にカードがあれば既存 uid を返す（created=false）。
 *
 * 在庫(unlinked)プールは流用しない（[[feedback_nfc_card_uid_model]]）。ロジックは mintCardForPro に集約。
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'
import { mintCardForPro } from '@/lib/certification-card'

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

  const result = await mintCardForPro(getSupabaseAdmin(), body.proId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'mint_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, cardUid: result.cardUid, created: result.created })
}
