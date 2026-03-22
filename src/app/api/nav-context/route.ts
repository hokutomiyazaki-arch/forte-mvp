import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/nav-context
 * Navbar用の軽量コンテキスト取得
 * - ownedOrg: オーナーの団体情報
 * - hasOrgMembership: 所属団体があるか
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ ownedOrg: null, hasOrgMembership: false })
    }

    const supabase = getSupabaseAdmin()

    // /api/dashboard のパターンを参考に並列取得
    const [ownedOrgResult, proResult] = await Promise.all([
      supabase
        .from('organizations')
        .select('id, name, type')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('professionals')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle(),
    ])

    // hasOrgMembership: プロIDがある場合はprofessional_idで検索、なければuser_idでフォールバック
    let hasOrgMembership = false
    if (proResult.data) {
      const membershipResult = await supabase
        .from('org_members')
        .select('id')
        .eq('professional_id', proResult.data.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      hasOrgMembership = !!membershipResult.data
    }

    // フォールバック: professional_idで見つからない場合、user_idで検索（一般会員のバッジclaim等）
    if (!hasOrgMembership) {
      const userOrgResult = await supabase
        .from('org_members')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (userOrgResult.data) {
        hasOrgMembership = true
      }
    }

    return NextResponse.json({
      ownedOrg: ownedOrgResult.data || null,
      hasOrgMembership,
    })
  } catch {
    return NextResponse.json({ ownedOrg: null, hasOrgMembership: false })
  }
}
