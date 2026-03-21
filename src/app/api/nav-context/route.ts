import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/nav-context
 * Navbar用の軽量コンテキスト取得
 * - ownedOrg: オーナーの団体情報
 * - hasOrgMembership: 所属団体があるか
 * - isPro: プロ登録済みか
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ ownedOrg: null, hasOrgMembership: false, isPro: false })
    }

    const supabase = getSupabaseAdmin()

    // 3つ並列で取得（/api/dashboard のパターンを参考）
    const [ownedOrgResult, proResult, membershipResult] = await Promise.all([
      // ownedOrg: organizations テーブルから owner_id で検索
      supabase
        .from('organizations')
        .select('id, name, type')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // isPro: professionals テーブルで確認
      supabase
        .from('professionals')
        .select('id')
        .eq('user_id', userId)
        .is('deactivated_at', null)
        .maybeSingle(),
      // hasOrgMembership: org_members で active な所属があるか
      // /api/my/organizations のパターンを参考
      supabase
        .from('org_members')
        .select('id, professional_id!inner(user_id)')
        .eq('professional_id.user_id', userId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle(),
    ])

    return NextResponse.json({
      ownedOrg: ownedOrgResult.data || null,
      hasOrgMembership: !!membershipResult.data,
      isPro: !!proResult.data,
    })
  } catch {
    return NextResponse.json({ ownedOrg: null, hasOrgMembership: false, isPro: false })
  }
}
