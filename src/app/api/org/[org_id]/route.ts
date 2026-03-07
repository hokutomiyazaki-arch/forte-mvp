import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { org_id: string } }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const orgId = params.org_id

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle()

    if (orgError) throw orgError
    if (!org) return NextResponse.json({ error: '団体が見つかりません' }, { status: 404 })

    const [membersResult, aggResult] = await Promise.all([
      supabase
        .from('org_proof_summary')
        .select('*')
        .eq('organization_id', orgId)
        .order('total_votes', { ascending: false }),

      supabase
        .from('org_aggregate')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle(),
    ])

    const members = membersResult.data || []
    const aggregate = aggResult.data

    let levelAggregates: any[] = []
    if (org.type === 'credential' || org.type === 'education') {
      const [levelsResult, levelMembersResult] = await Promise.all([
        supabase
          .from('credential_levels')
          .select('*')
          .eq('organization_id', orgId)
          .order('sort_order', { ascending: true }),

        supabase
          .from('org_members')
          .select('credential_level_id, professional_id')
          .eq('organization_id', orgId)
          .eq('status', 'active'),
      ])

      const levels = levelsResult.data || []
      const levelMembers = (levelMembersResult.data || []).filter((m: any) => m.credential_level_id)

      const votesMap = new Map<string, number>()
      for (const m of members) {
        votesMap.set(m.professional_id, Number(m.total_votes) || 0)
      }

      levelAggregates = levels.map((cl: any) => {
        const membersInLevel = levelMembers.filter((m: any) => m.credential_level_id === cl.id)
        return {
          level_id: cl.id,
          organization_id: cl.organization_id,
          level_name: cl.name,
          image_url: cl.image_url,
          sort_order: cl.sort_order,
          member_count: membersInLevel.length,
          total_votes: membersInLevel.reduce(
            (sum: number, m: any) => sum + (votesMap.get(m.professional_id) || 0), 0
          ),
        }
      })
    }

    return NextResponse.json({ org, members, aggregate, levelAggregates })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
