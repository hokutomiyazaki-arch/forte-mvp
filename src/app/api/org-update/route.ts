import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * PUT /api/org-update
 * 団体情報（名前・説明）を更新
 */
export async function PUT(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { organization_id, name, description } = body

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // オーナー確認
    const { data: org } = await supabase
      .from('organizations')
      .select('owner_id')
      .eq('id', organization_id)
      .maybeSingle()

    if (!org || org.owner_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 更新データ構築
    const updateData: Record<string, any> = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description

    const { data, error } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', organization_id)
      .select()
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ organization: data })
  } catch (error: any) {
    console.error('[org-update] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
