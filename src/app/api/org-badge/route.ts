import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/org-badge?org_id=xxx
 * バッジ新規作成ページ用: organizations + credential_levelsの件数を返す
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseAdmin()
    const orgId = req.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const [orgResult, levelsResult] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', orgId).eq('owner_id', userId).maybeSingle(),
      supabase.from('credential_levels').select('id').eq('organization_id', orgId),
    ])

    if (!orgResult.data) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({
      org: orgResult.data,
      badgeCount: (levelsResult.data || []).length,
    })
  } catch (error: any) {
    console.error('[org-badge GET] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/org-badge
 * バッジ（credential_levels）新規作成。重複チェック付き
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseAdmin()
    const body = await req.json()
    const { organization_id, name, description, image_url, sort_order } = body

    if (!organization_id || !name) {
      return NextResponse.json({ error: 'organization_id と name は必須です' }, { status: 400 })
    }

    // オーナー権限チェック
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', organization_id)
      .eq('owner_id', userId)
      .maybeSingle()

    if (!org) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 重複チェック
    const { data: existing } = await supabase
      .from('credential_levels')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('name', name)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: '同じ名前のバッジが既に存在します' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('credential_levels')
      .insert({ organization_id, name, description, image_url, sort_order })
      .select()
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ badge: data })
  } catch (error: any) {
    console.error('[org-badge POST] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT /api/org-badge
 * バッジ（credential_levels）の名前・説明・画像を更新
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
      .from('credential_levels')
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
      .from('credential_levels')
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
