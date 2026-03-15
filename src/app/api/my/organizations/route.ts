import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/my/organizations
 * メンバー用: 自分が所属する団体一覧を返す（status='active'のみ）
 * org_membersは1プロ×複数バッジ=複数行のため、organization_idで重複排除する
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    // 1. このユーザーのprofessional_idを取得（プロ会員の場合）
    const { data: pro } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', userId)
      .is('deactivated_at', null)
      .maybeSingle()

    const uniqueOrgs = new Map<string, any>()

    // 2a. プロ会員: professional_id で検索
    if (pro) {
      const { data: proMemberships, error } = await supabase
        .from('org_members')
        .select('organization_id, organizations(id, name, description, logo_url)')
        .eq('professional_id', pro.id)
        .eq('status', 'active')
      if (error) throw error
      for (const m of proMemberships || []) {
        const org = m.organizations as any
        if (org && !uniqueOrgs.has(m.organization_id)) {
          uniqueOrgs.set(m.organization_id, org)
        }
      }
    }

    // 2b. 一般会員: user_id で検索（professional_id が NULL のレコード）
    const { data: generalMemberships, error: genError } = await supabase
      .from('org_members')
      .select('organization_id, organizations(id, name, description, logo_url)')
      .eq('user_id', userId)
      .is('professional_id', null)
      .eq('status', 'active')
    if (genError) throw genError
    for (const m of generalMemberships || []) {
      const org = m.organizations as any
      if (org && !uniqueOrgs.has(m.organization_id)) {
        uniqueOrgs.set(m.organization_id, org)
      }
    }

    return NextResponse.json(Array.from(uniqueOrgs.values()))
  } catch (error: any) {
    console.error('[my/organizations GET] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
