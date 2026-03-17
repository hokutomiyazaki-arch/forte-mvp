import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// 認証チェック: rp_admin_auth クッキー
async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  const auth = cookieStore.get('rp_admin_auth')
  return auth?.value === 'authenticated'
}

// GET: 最新のアクティブコンテンツを取得
export async function GET() {
  const isAdmin = await checkAdminAuth()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('weekly_report_content')
    .select('*')
    .eq('is_active', true)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// POST: コンテンツを保存（同じ week_start があれば UPDATE、なければ INSERT）
export async function POST(req: NextRequest) {
  const isAdmin = await checkAdminAuth()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { week_start, highlight_text, tips_text } = body

  if (!week_start) {
    return NextResponse.json({ error: 'week_start is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // 同じ week_start のレコードがあるか確認
  const { data: existing } = await supabase
    .from('weekly_report_content')
    .select('id')
    .eq('week_start', week_start)
    .maybeSingle()

  if (existing) {
    // UPDATE
    const { data, error } = await supabase
      .from('weekly_report_content')
      .update({
        highlight_text: highlight_text || null,
        tips_text: tips_text || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data, action: 'updated' })
  } else {
    // INSERT
    const { data, error } = await supabase
      .from('weekly_report_content')
      .insert({
        week_start,
        highlight_text: highlight_text || null,
        tips_text: tips_text || null,
      })
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data, action: 'created' })
  }
}
