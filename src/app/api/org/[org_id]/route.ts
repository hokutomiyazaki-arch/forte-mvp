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

    const [orgMembersResult, aggResult] = await Promise.all([
      supabase
        .from('org_members')
        .select('id, professional_id, credential_level_id, status, professionals(id, name, photo_url)')
        .eq('organization_id', orgId)
        .eq('status', 'active'),

      supabase
        .from('org_aggregate')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle(),
    ])

    const allOrgMembers = orgMembersResult.data || []
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

      levelAggregates = levels.map((cl: any) => {
        const membersInLevel = levelMembers.filter((m: any) => m.credential_level_id === cl.id)

        const memberDetails = membersInLevel.map((m: any) => {
          const om = allOrgMembers.find((o: any) => o.professional_id === m.professional_id)
          return {
            professional_id: m.professional_id,
            name: (om as any)?.professionals?.name || '',
            photo_url: (om as any)?.professionals?.photo_url || null,
          }
        })

        return {
          level_id: cl.id,
          organization_id: cl.organization_id,
          level_name: cl.name,
          image_url: cl.image_url,
          sort_order: cl.sort_order,
          member_count: membersInLevel.length,
          total_votes: 0,
          members: memberDetails,
        }
      })
    }

    return NextResponse.json({ org, members: allOrgMembers, aggregate, levelAggregates })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
