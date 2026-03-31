import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) } }
  )
}

// GET: 団体アプリ一覧取得
export async function GET(
  req: NextRequest,
  { params }: { params: { org_id: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('org_resources')
    .select('*')
    .eq('organization_id', params.org_id)
    .eq('resource_type', 'app')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ apps: data })
}

// POST: 団体アプリ登録
export async function POST(
  req: NextRequest,
  { params }: { params: { org_id: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabase()

  // オーナー権限チェック
  const { data: org } = await supabase
    .from('organizations')
    .select('owner_id')
    .eq('id', params.org_id)
    .maybeSingle()

  const { data: pro } = await supabase
    .from('professionals')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!org || !pro || org.owner_id !== pro.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { title, url, description, credential_level_id, sort_order } = body

  if (!title || !url) {
    return NextResponse.json({ error: 'title と url は必須です' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('org_resources')
    .insert({
      organization_id: params.org_id,
      title,
      url,
      description: description || null,
      credential_level_id: credential_level_id || null,
      sort_order: sort_order || 99,
      is_active: true,
      resource_type: 'app',
    })
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ app: data })
}
