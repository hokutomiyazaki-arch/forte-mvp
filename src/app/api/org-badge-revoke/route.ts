import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/org-badge-revoke
 * プロの認定を剥奪（この団体のバッジを削除）
 * - badge_level_id あり → 個別バッジのみ削除（org_members の credential_level_id 一致レコード）
 * - badge_level_id なし → この団体の全レコードを削除（org_members）
 */
export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const memberId = searchParams.get('member_id')
    const organizationId = searchParams.get('organization_id')

    if (!memberId || !organizationId) {
      return NextResponse.json(
        { error: 'member_id and organization_id are required' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()

    // この団体のオーナーか確認
    const { data: org } = await supabase
      .from('organizations')
      .select('id, owner_id')
      .eq('id', organizationId)
      .maybeSingle()

    if (!org || org.owner_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 削除前にメンバー情報を取得（リワード連動削除のため）
    const { data: member } = await supabase
      .from('org_members')
      .select('professional_id, credential_level_id')
      .eq('id', memberId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    const { error } = await supabase
      .from('org_members')
      .delete()
      .eq('id', memberId)
      .eq('organization_id', organizationId)

    if (error) throw error

    // バッジに紐づく団体リワードを連動削除
    if (member?.professional_id && member?.credential_level_id) {
      const { data: orgResources } = await supabase
        .from('org_resources')
        .select('url')
        .eq('organization_id', organizationId)
        .eq('credential_level_id', member.credential_level_id)
        .eq('resource_type', 'app')

      const urls = (orgResources || []).map((r: any) => r.url).filter(Boolean)
      if (urls.length > 0) {
        await supabase
          .from('rewards')
          .delete()
          .eq('professional_id', member.professional_id)
          .eq('reward_type', 'org_app')
          .in('url', urls)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[org-badge-revoke] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
