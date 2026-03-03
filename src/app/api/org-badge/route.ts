import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * PUT /api/org-badge
 * バッジ（org_badge_levels）の名前・説明・画像を更新
 */
export async function PUT(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { badge_id, name, description, image_url } = body

    if (!badge_id) {
      return NextResponse.json({ error: 'badge_id is required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // このバッジが属する団体のオーナーか確認
    const { data: badge } = await supabase
      .from('org_badge_levels')
      .select('id, organization_id, organizations(owner_id)')
      .eq('id', badge_id)
      .maybeSingle()

    if (!badge) {
      return NextResponse.json({ error: 'Badge not found' }, { status: 404 })
    }

    const orgData = badge.organizations as any
    if (orgData?.owner_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 更新データを構築
    const updateData: Record<string, any> = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (image_url !== undefined) updateData.image_url = image_url

    const { data: updated, error } = await supabase
      .from('org_badge_levels')
      .update(updateData)
      .eq('id', badge_id)
      .select()
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ badge: updated })
  } catch (error: any) {
    console.error('[org-badge PUT] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
