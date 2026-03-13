import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/organizations/[orgId]/resources
 * オーナー用: 団体のリソース一覧取得（全件、is_active問わず）
 * credential_levelsの名前もJOIN
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { orgId } = params

    // オーナー確認
    const { data: org } = await supabase
      .from('organizations')
      .select('id, owner_id')
      .eq('id', orgId)
      .maybeSingle()

    if (!org || org.owner_id !== userId) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }

    // リソース一覧取得（credential_levelsのnameもJOIN）
    const { data: resources, error } = await supabase
      .from('org_resources')
      .select('id, title, url, description, sort_order, is_active, credential_level_id, created_at, updated_at, credential_levels(name)')
      .eq('organization_id', orgId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) throw error

    // credential_level_name をフラットに変換
    const result = (resources || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      description: r.description,
      sort_order: r.sort_order,
      is_active: r.is_active,
      credential_level_id: r.credential_level_id,
      credential_level_name: r.credential_levels?.name || null,
      created_at: r.created_at,
    }))

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[org-resources GET] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/organizations/[orgId]/resources
 * オーナー用: リソース追加
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { orgId } = params

    // オーナー確認
    const { data: org } = await supabase
      .from('organizations')
      .select('id, owner_id')
      .eq('id', orgId)
      .maybeSingle()

    if (!org || org.owner_id !== userId) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }

    const body = await req.json()
    const { title, url, description, credential_level_id } = body

    // バリデーション
    if (!title || typeof title !== 'string' || title.trim().length === 0 || title.trim().length > 100) {
      return NextResponse.json({ error: 'タイトルは1〜100文字で入力してください' }, { status: 400 })
    }
    if (!url || typeof url !== 'string' || !url.startsWith('https://') || url.length > 2000) {
      return NextResponse.json({ error: 'URLはhttps://で始まる2000文字以内のURLを入力してください' }, { status: 400 })
    }
    if (description && (typeof description !== 'string' || description.length > 500)) {
      return NextResponse.json({ error: '説明文は500文字以内で入力してください' }, { status: 400 })
    }

    // credential_level_id が指定されている場合、その団体のバッジか確認
    if (credential_level_id) {
      const { data: level } = await supabase
        .from('credential_levels')
        .select('id')
        .eq('id', credential_level_id)
        .eq('organization_id', orgId)
        .maybeSingle()

      if (!level) {
        return NextResponse.json({ error: '指定されたバッジが見つかりません' }, { status: 400 })
      }
    }

    // 現在の最大sort_orderを取得
    const { data: maxSortData } = await supabase
      .from('org_resources')
      .select('sort_order')
      .eq('organization_id', orgId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextSortOrder = (maxSortData?.sort_order ?? -1) + 1

    // リソース作成
    const { data: resource, error } = await supabase
      .from('org_resources')
      .insert({
        organization_id: orgId,
        title: title.trim(),
        url: url.trim(),
        description: description?.trim() || null,
        credential_level_id: credential_level_id || null,
        sort_order: nextSortOrder,
      })
      .select()
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ success: true, resource })
  } catch (error: any) {
    console.error('[org-resources POST] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
