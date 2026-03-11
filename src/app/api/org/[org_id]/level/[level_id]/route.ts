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
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        global: {
          fetch: (url, options = {}) =>
            fetch(url, { ...options, cache: 'no-store' }),
        },
      }
    )
    const { org_id: orgId, level_id: levelId } = params

    const [orgResult, levelResult, membersResult] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
      supabase.from('credential_levels').select('*').eq('id', levelId).maybeSingle(),
      supabase
        .from('org_members')
        .select('professional_id, user_id')
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

    // プロのみ（professional_idあり）
    professionals = allMembers
      .filter((m: any) => m.professional_id != null)
      .map((m: any) => {
        const pro = profMap.get(m.professional_id)
        return {
          professional_id: m.professional_id,
          professional_name: pro?.name || '不明',
          photo_url: pro?.photo_url || null,
          title: pro?.title || '',
          total_votes: votesMap.get(m.professional_id) || 0,
        }
      })
      .sort((a: any, b: any) => b.total_votes - a.total_votes)

    // 一般会員（professional_idなし）→ clientsから取得
    const generalUserIds = allMembers
      .filter((m: any) => !m.professional_id && m.user_id)
      .map((m: any) => m.user_id)
    let clientMap = new Map<string, any>()
    if (generalUserIds.length > 0) {
      const { data: clientData } = await supabase
        .from('clients')
        .select('user_id, nickname, photo_url')
        .in('user_id', generalUserIds)
      for (const c of (clientData || [])) {
        clientMap.set(c.user_id, c)
      }
    }
    const generalMembers = allMembers
      .filter((m: any) => !m.professional_id)
      .map((m: any) => {
        const client = m.user_id ? clientMap.get(m.user_id) : null
        return {
          user_id: m.user_id || null,
          display_name: client?.nickname || '一般会員',
          photo_url: client?.photo_url || null,
        }
      })

    return NextResponse.json({
      org: orgResult.data,
      level: levelResult.data,
      professionals,
      generals: generalMembers,
      general_count: generalMembers.length,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
