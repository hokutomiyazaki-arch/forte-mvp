import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/organizations/[orgId]/resources/[resourceId]
 * オーナー用: リソース編集
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { orgId: string; resourceId: string } }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { orgId, resourceId } = params

    // オーナー確認
    const { data: org } = await supabase
      .from('organizations')
      .select('id, owner_id')
      .eq('id', orgId)
      .maybeSingle()

    if (!org || org.owner_id !== userId) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }

    // リソースが存在し、この団体のものか確認
    const { data: existing } = await supabase
      .from('org_resources')
      .select('id')
      .eq('id', resourceId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'リソースが見つかりません' }, { status: 404 })
    }

    const body = await req.json()
    const updateData: Record<string, any> = {}

    // title
    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim().length === 0 || body.title.trim().length > 100) {
        return NextResponse.json({ error: 'タイトルは1〜100文字で入力してください' }, { status: 400 })
      }
      updateData.title = body.title.trim()
    }

    // url
    if (body.url !== undefined) {
      if (typeof body.url !== 'string' || !body.url.startsWith('https://') || body.url.length > 2000) {
        return NextResponse.json({ error: 'URLはhttps://で始まる2000文字以内のURLを入力してください' }, { status: 400 })
      }
      updateData.url = body.url.trim()
    }

    // description
    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description === 'string' && body.description.length > 500) {
        return NextResponse.json({ error: '説明文は500文字以内で入力してください' }, { status: 400 })
      }
      updateData.description = body.description?.trim() || null
    }

    // sort_order
    if (body.sort_order !== undefined) {
      updateData.sort_order = Number(body.sort_order)
    }

    // is_active
    if (body.is_active !== undefined) {
      updateData.is_active = Boolean(body.is_active)
    }

    // credential_level_id
    if (body.credential_level_id !== undefined) {
      if (body.credential_level_id !== null) {
        const { data: level } = await supabase
          .from('credential_levels')
          .select('id')
          .eq('id', body.credential_level_id)
          .eq('organization_id', orgId)
          .maybeSingle()

        if (!level) {
          return NextResponse.json({ error: '指定されたバッジが見つかりません' }, { status: 400 })
        }
      }
      updateData.credential_level_id = body.credential_level_id
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '更新するフィールドがありません' }, { status: 400 })
    }

    updateData.updated_at = new Date().toISOString()

    const { data: resource, error } = await supabase
      .from('org_resources')
      .update(updateData)
      .eq('id', resourceId)
      .eq('organization_id', orgId)
      .select()
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ success: true, resource })
  } catch (error: any) {
    console.error('[org-resources PATCH] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/organizations/[orgId]/resources/[resourceId]
 * オーナー用: リソース削除
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { orgId: string; resourceId: string } }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { orgId, resourceId } = params

    // オーナー確認
    const { data: org } = await supabase
      .from('organizations')
      .select('id, owner_id')
      .eq('id', orgId)
      .maybeSingle()

    if (!org || org.owner_id !== userId) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }

    // リソースが存在し、この団体のものか確認
    const { data: existing } = await supabase
      .from('org_resources')
      .select('id')
      .eq('id', resourceId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'リソースが見つかりません' }, { status: 404 })
    }

    const { error } = await supabase
      .from('org_resources')
      .delete()
      .eq('id', resourceId)
      .eq('organization_id', orgId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[org-resources DELETE] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
