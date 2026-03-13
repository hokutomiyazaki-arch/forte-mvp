import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/my/organizations/[orgId]/resources
 * メンバー用: 特定団体のリソース一覧を返す
 * is_active=true のみ
 * credential_level_id でバッジ限定フィルタ（NULL=全メンバー向け、UUID=該当バッジ保持者のみ）
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

    // 1. professional_id取得
    const { data: pro } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', userId)
      .is('deactivated_at', null)
      .maybeSingle()

    if (!pro) {
      return NextResponse.json({ error: 'プロとして登録されていません' }, { status: 403 })
    }

    // 2. この団体のアクティブメンバーか確認 + 持っているバッジIDを全取得
    const { data: memberships, error: memError } = await supabase
      .from('org_members')
      .select('credential_level_id')
      .eq('professional_id', pro.id)
      .eq('organization_id', orgId)
      .eq('status', 'active')

    if (memError) throw memError

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: 'この団体のメンバーではありません' }, { status: 403 })
    }

    // 3. メンバーが持つバッジIDの配列
    const myBadgeIds = memberships
      .map(m => m.credential_level_id)
      .filter(Boolean) as string[]

    // 4. リソース取得: is_active=true（credential_levelsのnameもJOIN）
    const { data: resources, error } = await supabase
      .from('org_resources')
      .select('id, title, url, description, sort_order, credential_level_id, created_at, credential_levels(name)')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) throw error

    // 5. フィルタリング（credential_level_id=NULL → 全員、UUID → バッジ一致のみ）
    const visibleResources = (resources || []).filter((r: any) => {
      if (!r.credential_level_id) return true
      return myBadgeIds.includes(r.credential_level_id)
    }).map((r: any) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      description: r.description,
      sort_order: r.sort_order,
      credential_level_id: r.credential_level_id,
      credential_level_name: r.credential_levels?.name || null,
      created_at: r.created_at,
    }))

    return NextResponse.json(visibleResources)
  } catch (error: any) {
    console.error('[my/organizations/resources GET] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
