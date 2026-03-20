import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  const auth = cookieStore.get('rp_admin_auth')
  return auth?.value === 'authenticated'
}

// GET: 全バナー取得（管理者用、is_active関係なく全件）
export async function GET() {
  const isAdmin = await checkAdminAuth()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ announcements: data || [] })
}

// POST: 新規バナー作成
export async function POST(req: NextRequest) {
  const isAdmin = await checkAdminAuth()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { title, body: bodyText, link_url, link_label, target, banner_type, starts_at, expires_at } = body

  if (!title || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('announcements')
    .insert({
      title: title.trim(),
      body: bodyText?.trim() || null,
      link_url: link_url?.trim() || null,
      link_label: link_label?.trim() || null,
      target: target || 'all',
      banner_type: banner_type || 'info',
      starts_at: starts_at || new Date().toISOString(),
      expires_at: expires_at || null,
      is_active: true,
    })
    .select()
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
