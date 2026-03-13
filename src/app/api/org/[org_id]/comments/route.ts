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

    // 団体情報
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, type')
      .eq('id', orgId)
      .maybeSingle()

    if (orgError) throw orgError
    if (!org) return NextResponse.json({ error: '団体が見つかりません' }, { status: 404 })

    // professional_idベースで直接取得（org_members JOINなし）
    const { data: memberData } = await supabase
      .from('org_members')
      .select('professional_id')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .not('professional_id', 'is', null)

    const professionalIds = Array.from(new Set((memberData || []).map((m: any) => m.professional_id)))

    if (professionalIds.length === 0) {
      return NextResponse.json({ org, comments: [] })
    }

    // votesから全コメント取得（professional_idベース直接）
    const { data: commentsRaw } = await supabase
      .from('votes')
      .select('comment, professional_id, created_at')
      .in('professional_id', professionalIds)
      .not('comment', 'is', null)
      .neq('comment', '')
      .order('created_at', { ascending: false })

    // プロ名マップ
    const { data: prosData } = await supabase
      .from('professionals')
      .select('id, name')
      .in('id', professionalIds)

    const proNameMap = new Map((prosData || []).map((p: any) => [p.id, p.name]))

    const comments = (commentsRaw || []).map((c: any) => ({
      comment: c.comment,
      professional_name: proNameMap.get(c.professional_id) || '',
      professional_id: c.professional_id,
      created_at: c.created_at,
    }))

    return NextResponse.json({ org, comments })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
