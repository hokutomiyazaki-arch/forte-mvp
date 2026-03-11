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

    const professionalIds = (membersResult.data || []).map((m: any) => m.professional_id)

    let professionals: any[] = []
    if (professionalIds.length > 0) {
      const { data: profData } = await supabase
        .from('professionals')
        .select('id, name, photo_url, title')
        .in('id', professionalIds)

      // 投票数を org_proof_summary からマージ
      const { data: summaryData } = await supabase
        .from('org_proof_summary')
        .select('professional_id, total_votes')
        .eq('organization_id', orgId)
        .in('professional_id', professionalIds)

      const votesMap = new Map((summaryData || []).map((s: any) => [s.professional_id, s.total_votes || 0]))

      professionals = (profData || [])
        .map((p: any) => ({
          professional_id: p.id,
          professional_name: p.name,
          photo_url: p.photo_url,
          title: p.title,
          total_votes: votesMap.get(p.id) || 0,
        }))
        .sort((a: any, b: any) => b.total_votes - a.total_votes)
    }

    return NextResponse.json({
      org: orgResult.data,
      level: levelResult.data,
      professionals,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
