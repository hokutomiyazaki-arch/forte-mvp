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

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabase()

  // プロのIDを取得
  const { data: pro } = await supabase
    .from('professionals')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!pro) return NextResponse.json({ availableApps: [] })

  // プロの所属（organization_id + credential_level_id）を取得
  const { data: memberships } = await supabase
    .from('org_members')
    .select('organization_id, credential_level_id')
    .eq('professional_id', pro.id)

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ availableApps: [] })
  }

  const orgIds = Array.from(new Set(memberships.map((m: any) => m.organization_id)))
  const myLevelIds = memberships
    .map((m: any) => m.credential_level_id)
    .filter(Boolean)

  // 所属団体の全アプリを取得
  const { data: allApps } = await supabase
    .from('org_resources')
    .select('*, organizations(name)')
    .in('organization_id', orgIds)
    .eq('resource_type', 'app')
    .eq('is_active', true)
    .order('organization_id')
    .order('sort_order', { ascending: true })

  if (!allApps) return NextResponse.json({ availableApps: [] })

  // credential_level_id が NULL（全員向け）か、プロが持つバッジと一致するものだけ返す
  const availableApps = allApps.filter((app: any) =>
    app.credential_level_id === null ||
    myLevelIds.includes(app.credential_level_id)
  )

  return NextResponse.json({ availableApps })
}
