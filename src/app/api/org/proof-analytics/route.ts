import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { TAB_DISPLAY_NAMES } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/**
 * GET /api/org/proof-analytics?orgId=xxx
 * 団体の強みランキング + メンバー別強みテーブル
 * vote_summary ビュー（UNNEST済み）を活用
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('orgId')
    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // オーナー権限チェック
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .eq('owner_id', userId)
      .maybeSingle()

    if (!org) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // credential_level_id フィルタ（Fix 3）
    const credentialLevelId = request.nextUrl.searchParams.get('credential_level_id')

    // バッジ一覧を取得（フィルタUI用）
    const { data: credentialLevels } = await supabase
      .from('credential_levels')
      .select('id, name')
      .eq('organization_id', orgId)
      .order('name')

    // アクティブメンバーのprofessional_id一覧を取得
    // org_membersはバッジ別に複数行持つため、Mapで重複排除（Fix 2）
    let membersQuery = supabase
      .from('org_members')
      .select('professional_id, professionals(id, name, photo_url)')
      .eq('organization_id', orgId)
      .eq('status', 'active')

    if (credentialLevelId) {
      membersQuery = membersQuery.eq('credential_level_id', credentialLevelId)
    }

    const { data: rawMembers } = await membersQuery

    if (!rawMembers || rawMembers.length === 0) {
      return NextResponse.json({
        topProofItems: [],
        memberStrengths: [],
        credentialLevels: credentialLevels || [],
      })
    }

    // Mapで重複排除: 同じprofessional_idは1つだけ残す（Fix 2）
    const uniqueMemberMap = new Map<string, typeof rawMembers[0]>()
    for (const m of rawMembers) {
      if (!uniqueMemberMap.has(m.professional_id)) {
        uniqueMemberMap.set(m.professional_id, m)
      }
    }
    const members = Array.from(uniqueMemberMap.values())

    const memberProIds = members.map(m => m.professional_id)

    // proof_items マスタ取得
    const { data: proofItems } = await supabase
      .from('proof_items')
      .select('id, label, tab, strength_label')

    const proofMap = new Map<string, { label: string; tab: string; strength_label: string }>()
    for (const pi of proofItems || []) {
      proofMap.set(pi.id, { label: pi.label, tab: pi.tab || '', strength_label: pi.strength_label || '' })
    }

    // vote_summary ビューから団体メンバーのデータを取得
    // vote_summary: professional_id, proof_id, vote_count (UNNESTは既にビュー内で実行済み)
    const [{ data: voteSummary }, { data: proofSummary }] = await Promise.all([
      supabase
        .from('vote_summary')
        .select('professional_id, proof_id, vote_count')
        .in('professional_id', memberProIds),
      // org_proof_summary から正確な総プルーフ数を取得（vote_summaryはselected_proof_idsがある投票のみ）
      supabase
        .from('org_proof_summary')
        .select('professional_id, total_votes')
        .eq('organization_id', orgId),
    ])

    // 正確な総プルーフ数マップ
    const totalVotesMap = new Map<string, number>()
    for (const s of proofSummary || []) {
      totalVotesMap.set(s.professional_id, Number(s.total_votes) || 0)
    }

    const summaryData = voteSummary || []

    // ① 強みランキング TOP10: proof_id別に全メンバーの投票数を合算
    const proofTotals = new Map<string, number>()
    for (const row of summaryData) {
      const current = proofTotals.get(row.proof_id) || 0
      proofTotals.set(row.proof_id, current + (row.vote_count || 0))
    }

    const topProofItems = Array.from(proofTotals.entries())
      .map(([proof_id, count]) => {
        const info = proofMap.get(proof_id)
        return {
          proof_id,
          label: info?.label || proof_id,
          strength_label: info?.strength_label || (info?.tab ? TAB_DISPLAY_NAMES[info.tab] : '') || '',
          count,
        }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // ② メンバー別強みテーブル
    // メンバーごとにtotal_proofs と top_proof_labels(上位3件)を組み立てる
    const memberProofMap = new Map<string, { total: number; proofs: { proof_id: string; count: number }[] }>()

    for (const row of summaryData) {
      if (!memberProofMap.has(row.professional_id)) {
        memberProofMap.set(row.professional_id, { total: 0, proofs: [] })
      }
      const entry = memberProofMap.get(row.professional_id)!
      entry.total += row.vote_count || 0
      entry.proofs.push({ proof_id: row.proof_id, count: row.vote_count || 0 })
    }

    const memberStrengths = members.map(m => {
      const pro = m.professionals as any
      const proofData = memberProofMap.get(m.professional_id)

      // 上位3件のproof_labelsを取得
      const topProofLabels = (proofData?.proofs || [])
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map(p => proofMap.get(p.proof_id)?.label || p.proof_id)

      return {
        professional_id: m.professional_id,
        name: pro?.name || '不明',
        photo_url: pro?.photo_url || null,
        total_proofs: totalVotesMap.get(m.professional_id) || proofData?.total || 0,
        top_proof_labels: topProofLabels,
      }
    }).sort((a, b) => b.total_proofs - a.total_proofs)

    return NextResponse.json({
      topProofItems,
      memberStrengths,
      credentialLevels: credentialLevels || [],
    })
  } catch (error: any) {
    console.error('[org/proof-analytics] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
