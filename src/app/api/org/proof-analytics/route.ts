import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

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

    // アクティブメンバーのprofessional_id一覧を取得
    const { data: members } = await supabase
      .from('org_members')
      .select('professional_id, professionals(id, name, photo_url)')
      .eq('organization_id', orgId)
      .eq('status', 'active')

    if (!members || members.length === 0) {
      return NextResponse.json({
        topProofItems: [],
        memberStrengths: [],
      })
    }

    const memberProIds = members.map(m => m.professional_id)

    // proof_items マスタ取得
    const { data: proofItems } = await supabase
      .from('proof_items')
      .select('id, label, strength_label')

    const proofMap = new Map<string, { label: string; strength_label: string }>()
    for (const pi of proofItems || []) {
      proofMap.set(pi.id, { label: pi.label, strength_label: pi.strength_label || '' })
    }

    // vote_summary ビューから団体メンバーのデータを取得
    // vote_summary: professional_id, proof_id, vote_count (UNNESTは既にビュー内で実行済み)
    const { data: voteSummary } = await supabase
      .from('vote_summary')
      .select('professional_id, proof_id, vote_count')
      .in('professional_id', memberProIds)

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
          strength_label: info?.strength_label || '',
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
        total_proofs: proofData?.total || 0,
        top_proof_labels: topProofLabels,
      }
    }).sort((a, b) => b.total_proofs - a.total_proofs)

    return NextResponse.json({
      topProofItems,
      memberStrengths,
    })
  } catch (error: any) {
    console.error('[org/proof-analytics] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
