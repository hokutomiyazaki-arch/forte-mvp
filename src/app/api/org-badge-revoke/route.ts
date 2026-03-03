import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/org-badge-revoke
 * プロの認定を剥奪（この団体のバッジを削除）
 * - badge_level_id あり → 個別バッジのみ削除
 * - badge_level_id なし → この団体の全メンバーシップを削除（バッジ+所属レコード）
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
      // 個別バッジのみ削除（org_membersからcredential_level_id一致のレコード削除）
      const { error } = await supabase
        .from('org_members')
        .delete()
        .eq('professional_id', professionalId)
        .eq('organization_id', organizationId)
        .eq('credential_level_id', badgeLevelId)

      if (error) throw error
    } else {
      // このプロの、この団体に対する全メンバーシップを削除
      // （credential_level_id付きバッジレコード + NULLの所属レコード両方）
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
