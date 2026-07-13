import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  const auth = cookieStore.get('rp_admin_auth')
  return auth?.value === 'authenticated'
}

// GET: 名前 or メールでプロを検索（FM付与対象を探す用）
// ?q=検索語（名前 or contact_email の部分一致、2文字以上）
export async function GET(req: NextRequest) {
  const isAdmin = await checkAdminAuth()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2) {
    return NextResponse.json({ error: 'q は2文字以上で指定してください' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // 名前 or メールの部分一致。退会者も表示（deactivated_at で判別できるように返す）
  const pattern = `%${q}%`
  const { data, error } = await supabase
    .from('professionals')
    .select('id, name, title, contact_email, is_founding_member, deactivated_at')
    .or(`name.ilike.${pattern},contact_email.ilike.${pattern}`)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ results: data || [] })
}

// POST: 指定プロの is_founding_member を明示的にセット
// body: { id: string, value: boolean }
export async function POST(req: NextRequest) {
  const isAdmin = await checkAdminAuth()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, value } = body

  if (!id || typeof value !== 'boolean') {
    return NextResponse.json({ error: 'id と value(boolean) が必要です' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('professionals')
    .update({ is_founding_member: value })
    .eq('id', id)
    .select('id, name, contact_email, is_founding_member')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: '対象のプロが見つかりませんでした' }, { status: 404 })
  }

  return NextResponse.json({ data })
}
