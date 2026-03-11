import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { org_id: string; level_id: string } }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { org_id: orgId, level_id: levelId } = params

    const [orgResult, levelResult, membersResult] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
      supabase.from('credential_levels').select('*').eq('id', levelId).maybeSingle(),
      supabase
        .from('org_members')
        .select('professional_id')
        .eq('organization_id', orgId)
        .eq('credential_level_id', levelId)
        .eq('status', 'active'),
    ])

    if (!orgResult.data) return NextResponse.json({ error: '団体が見つかりません' }, { status: 404 })
    if (!levelResult.data) return NextResponse.json({ error: 'レベルが見つかりません' }, { status: 404 })

    const allMembers = membersResult.data || []
    const professionalIds = allMembers
      .map((m: any) => m.professional_id)
      .filter((id: any) => id != null)

    let professionals: any[] = []

    // プロ情報を取得（professional_idがあるメンバーのみ）
    let profMap = new Map<string, any>()
    if (professionalIds.length > 0) {
      const { data: profData } = await supabase
        .from('professionals')
        .select('id, name, photo_url, title')
        .in('id', professionalIds)

      for (const p of (profData || [])) {
        profMap.set(p.id, p)
      }
    }

    // 投票数を org_proof_summary からマージ
    let votesMap = new Map<string, number>()
    if (professionalIds.length > 0) {
      const { data: summaryData } = await supabase
        .from('org_proof_summary')
        .select('professional_id, total_votes')
        .eq('organization_id', orgId)
        .in('professional_id', professionalIds)

      votesMap = new Map((summaryData || []).map((s: any) => [s.professional_id, s.total_votes || 0]))
    }

    // 全メンバー（プロ + 一般）をマージ
    professionals = allMembers
      .map((m: any) => {
        const pro = m.professional_id ? profMap.get(m.professional_id) : null
        return {
          professional_id: m.professional_id || null,
          professional_name: pro?.name || '一般会員',
          photo_url: pro?.photo_url || null,
          title: pro?.title || '',
          total_votes: m.professional_id ? (votesMap.get(m.professional_id) || 0) : 0,
        }
      })
      .sort((a: any, b: any) => b.total_votes - a.total_votes)

    return NextResponse.json({
      org: orgResult.data,
      level: levelResult.data,
      professionals,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
