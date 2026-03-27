import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  const auth = cookieStore.get('rp_admin_auth')
  return auth?.value === 'authenticated'
}

export async function GET() {
  const isAdmin = await checkAdminAuth()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // 1. プロごとの集計データ
  const { data: proStats, error: proError } = await supabase.rpc('get_tracking_stats')

  if (proError) {
    console.error('Tracking stats error:', proError)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }

  // 2. 全体サマリー
  const { data: summary, error: summaryError } = await supabase.rpc('get_tracking_summary')

  if (summaryError) {
    console.error('Tracking summary error:', summaryError)
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 })
  }

  return NextResponse.json({ proStats, summary })
}
