import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  const auth = cookieStore.get('rp_admin_auth')
  return auth?.value === 'authenticated'
}

// GET: 全不具合報告を取得
export async function GET() {
  const isAdmin = await checkAdminAuth()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('bug_reports')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ reports: data || [] })
}
