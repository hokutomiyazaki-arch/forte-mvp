import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/org/badge/delete?badgeId=xxx
 * バッジを削除する（取得者のorg_membersレコードも全て削除）
 */
export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const badgeId = req.nextUrl.searchParams.get('badgeId')
  if (!badgeId) {
    return NextResponse.json({ error: 'badgeId is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  try {
    // バッジの存在確認 + オーナー確認
    const { data: badge } = await supabase
      .from('credential_levels')
      .select('id, organization_id, organizations(owner_id)')
      .eq('id', badgeId)
      .maybeSingle()

    if (!badge) {
      return NextResponse.json({ error: 'Badge not found' }, { status: 404 })
    }

    const orgData = badge.organizations as any
    if (orgData?.owner_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 1. 削除前に影響を受けるプロのIDとリワードURLを取得
    const [affectedMembersResult, orgResourcesResult] = await Promise.all([
      supabase
        .from('org_members')
        .select('professional_id')
        .eq('credential_level_id', badgeId)
        .not('professional_id', 'is', null),
      supabase
        .from('org_resources')
        .select('url')
        .eq('organization_id', badge.organization_id)
        .eq('credential_level_id', badgeId)
        .eq('resource_type', 'app'),
    ])

    // 2. org_membersから該当credential_level_idのレコードを全削除
    const { error: membersError } = await supabase
      .from('org_members')
      .delete()
      .eq('credential_level_id', badgeId)

    if (membersError) throw membersError

    // 3. credential_levelsから該当バッジを削除
    const { error: badgeError } = await supabase
      .from('credential_levels')
      .delete()
      .eq('id', badgeId)

    if (badgeError) throw badgeError

    // 4. バッジに紐づく団体リワードを連動削除
    const proIds = Array.from(new Set(
      (affectedMembersResult.data || []).map((m: any) => m.professional_id).filter(Boolean)
    ))
    const urls = (orgResourcesResult.data || []).map((r: any) => r.url).filter(Boolean)
    if (proIds.length > 0 && urls.length > 0) {
      await supabase
        .from('rewards')
        .delete()
        .in('professional_id', proIds)
        .eq('reward_type', 'org_app')
        .in('url', urls)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[org/badge/delete] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
