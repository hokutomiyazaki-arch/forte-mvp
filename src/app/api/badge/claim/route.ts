import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { credentialLevelId } = await req.json()
  if (!credentialLevelId) return NextResponse.json({ error: 'invalid' })

  const supabase = getSupabaseAdmin()

  // credential_levelsからバッジ情報取得
  const { data: level } = await supabase
    .from('credential_levels')
    .select('id, name, description, image_url, organization_id, organizations(name)')
    .eq('claim_token', credentialLevelId)
    .maybeSingle()

  if (!level) return NextResponse.json({ error: 'invalid' })

  const orgName = (level.organizations as any)?.name || ''
  const badge = {
    name: level.name,
    description: level.description,
    image_url: level.image_url,
    org_name: orgName,
    org_id: level.organization_id,
  }

  // 重複チェック（user_idベース）
  const { data: existing } = await supabase
    .from('org_members')
    .select('id')
    .eq('credential_level_id', level.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'already', badge })

  // professional_idを取得（プロなら入れる、一般ユーザーはnull）
  const { data: pro } = await supabase
    .from('professionals')
    .select('id')
    .eq('user_id', userId)
    .is('deactivated_at', null)
    .maybeSingle()

  // org_membersにinsert
  const { error } = await supabase
    .from('org_members')
    .insert({
      organization_id: level.organization_id,
      credential_level_id: level.id,
      user_id: userId,
      professional_id: pro?.id || null,
      role: 'member',
      is_owner: false,
      status: 'active',
      accepted_at: new Date().toISOString(),
    })

  if (error) {
    console.error('[badge/claim] insert error:', error)
    return NextResponse.json({ error: 'db_error' })
  }

  return NextResponse.json({ badge })
}
