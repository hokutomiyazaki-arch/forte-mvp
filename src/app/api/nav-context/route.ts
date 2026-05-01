import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { SPECIALIST_THRESHOLD, getCertifiableTier, type CertifiableTier } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/**
 * GET /api/nav-context
 * Navbar用の軽量コンテキスト取得
 * - ownedOrg: オーナーの団体情報
 * - hasOrgMembership: 所属団体があるか
 * - eligibleCertificationTier: SPECIALIST(30+)/MASTER(50+)/LEGEND(100+) の最高ティアで
 *   未申請のものがあれば返す。なければ null。Navbar の認定申請メニュー表示用。
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({
        ownedOrg: null,
        hasOrgMembership: false,
        eligibleCertificationTier: null,
      })
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

    // 認定申請メニューの表示判定: SPECIALIST(30) 以上で未申請のカテゴリがあるか。
    // 最高票数のカテゴリの tier をラベル切り替えに使う。
    let eligibleCertificationTier: CertifiableTier | null = null
    if (proResult.data) {
      const proId = proResult.data.id
      const [voteSummaryResult, certApplicationsResult] = await Promise.all([
        supabase
          .from('vote_summary')
          .select('proof_id, vote_count')
          .eq('professional_id', proId)
          .gte('vote_count', SPECIALIST_THRESHOLD),
        supabase
          .from('certification_applications')
          .select('category_slug')
          .eq('professional_id', proId),
      ])
      const appliedSlugs = new Set(
        (certApplicationsResult.data || []).map((a: { category_slug: string }) => a.category_slug)
      )
      const eligible = (voteSummaryResult.data || [])
        .filter((v: { proof_id: string; vote_count: number }) => !appliedSlugs.has(v.proof_id))
      if (eligible.length > 0) {
        const topCount = Math.max(...eligible.map((v: { vote_count: number }) => v.vote_count))
        eligibleCertificationTier = getCertifiableTier(topCount)
      }
    }

    return NextResponse.json({
      ownedOrg: ownedOrgResult.data || null,
      hasOrgMembership,
      eligibleCertificationTier,
    })
  } catch {
    return NextResponse.json({
      ownedOrg: null,
      hasOrgMembership: false,
      eligibleCertificationTier: null,
    })
  }
}
