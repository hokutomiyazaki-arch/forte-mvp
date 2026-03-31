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

async function checkOwner(userId: string, orgId: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data: pro } = await supabase
    .from('professionals')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (!pro) return false

  const { data: org } = await supabase
    .from('organizations')
    .select('owner_id')
    .eq('id', orgId)
    .maybeSingle()

  return org?.owner_id === pro.id
}

// PUT: 更新
export async function PUT(
  req: NextRequest,
  { params }: { params: { org_id: string; appId: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await checkOwner(userId, params.org_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { title, url, description, credential_level_id, sort_order, is_active } = body

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('org_resources')
    .update({
      title,
      url,
      description: description || null,
      credential_level_id: credential_level_id || null,
      sort_order,
      is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.appId)
    .eq('organization_id', params.org_id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ app: data })
}

// DELETE: 削除
export async function DELETE(
  req: NextRequest,
  { params }: { params: { org_id: string; appId: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await checkOwner(userId, params.org_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabase()
  const { error } = await supabase
    .from('org_resources')
    .delete()
    .eq('id', params.appId)
    .eq('organization_id', params.org_id)
    .eq('resource_type', 'app')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
