/**
 * 認定カード — データ取得API（読み取り専用）
 *
 * GET /api/admin/certification-card/data
 *   → 認定申請のあるプロ一覧（選択UI用）
 * GET /api/admin/certification-card/data?proId={uuid}
 *   → そのプロのカードデータ（編集プレビュー用）＋ 次の認定番号プレビュー
 *
 * DBアクセスは service_role（getSupabaseAdmin）。書き込みは一切しない。
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  buildCardData,
  buildCertificates,
  listCertifiablePros,
  getNextCertNumber,
} from '@/lib/certification-card'

export const dynamic = 'force-dynamic'

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get('rp_admin_auth')?.value === 'authenticated'
}

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const proId = new URL(request.url).searchParams.get('proId')

  if (!proId) {
    const pros = await listCertifiablePros(supabase)
    return NextResponse.json({ pros })
  }

  const [data, certificates] = await Promise.all([
    buildCardData(supabase, proId),
    buildCertificates(supabase, proId),
  ])
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const nextCertNumber = await getNextCertNumber(supabase)
  return NextResponse.json({ data, certificates, nextCertNumber })
}
