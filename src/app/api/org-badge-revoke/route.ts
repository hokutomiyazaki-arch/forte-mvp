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
      // 個別バッジのみ削除（org_members の credential_level_id 一致レコード）
      const { error } = await supabase
        .from('org_members')
        .delete()
        .eq('professional_id', professionalId)
        .eq('organization_id', organizationId)
        .eq('credential_level_id', badgeLevelId)

      if (error) throw error
    } else {
      // この団体の全レコードを削除（org_members）
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
