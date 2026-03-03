import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/org-badge-revoke
 * プロの認定を剥奪（この団体のバッジを削除）
 * - badge_level_id あり → 個別バッジのみ削除（professional_badges + org_members）
 * - badge_level_id なし → この団体の全バッジを削除（professional_badges + org_members）
 */
export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const professionalId = searchParams.get('professional_id')
    const organizationId = searchParams.get('organization_id')
    const badgeLevelId = searchParams.get('badge_level_id')

    if (!professionalId || !organizationId) {
      return NextResponse.json(
        { error: 'professional_id and organization_id are required' },
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

    if (badgeLevelId) {
      // 個別バッジのみ削除
      // professional_badges から削除
      const { error: pbError } = await supabase
        .from('professional_badges')
        .delete()
        .eq('professional_id', professionalId)
        .eq('badge_level_id', badgeLevelId)

      if (pbError) throw pbError

      // org_members からも削除（credential_level_id一致）
      await supabase
        .from('org_members')
        .delete()
        .eq('professional_id', professionalId)
        .eq('organization_id', organizationId)
        .eq('credential_level_id', badgeLevelId)
    } else {
      // この団体の全バッジを削除
      // credential_levelsからこの団体のバッジIDを取得
      const { data: levels } = await supabase
        .from('credential_levels')
        .select('id')
        .eq('organization_id', organizationId)

      if (levels && levels.length > 0) {
        const levelIds = levels.map((l: any) => l.id)
        // professional_badges から該当バッジを全削除
        const { error: pbError } = await supabase
          .from('professional_badges')
          .delete()
          .eq('professional_id', professionalId)
          .in('badge_level_id', levelIds)

        if (pbError) throw pbError
      }

      // org_members からも全削除（所属レコード含む）
      const { error } = await supabase
        .from('org_members')
        .delete()
        .eq('professional_id', professionalId)
        .eq('organization_id', organizationId)

      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[org-badge-revoke] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
