import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  const auth = cookieStore.get('rp_admin_auth')
  return auth?.value === 'authenticated'
}

// PATCH: ステータス更新
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAdmin = await checkAdminAuth()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const { status } = body

  if (!status) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { error } = await supabase
    .from('bug_reports')
    .update({ status })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
