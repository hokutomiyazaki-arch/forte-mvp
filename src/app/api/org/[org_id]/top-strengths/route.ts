import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/org/[org_id]/top-strengths
 *
 * 団体シェアカード用: 団体が「本当の声で証明されてきた強み(proof_item単位)」を
 * 証明数の多い順に並べた匿名の分布を返す。
 *
 * ★思想: 団体カードに個人は出さない（顔写真・個人名を出さない）。
 *   個人の露出は本人の Voice シェア（既存）に任せる。よって代表プロ(topPro)は返さない。
 *   同じ理由でオプトアウト除外も不要（顔を出さないため）。
 *   ※ org_share_optouts テーブル自体は残置。ここで参照しないだけ。
 *
 * ⚠️ votes を vote_type='proof' でフィルタする点は意図的な設計判断。
 *    既存 strengthDistribution は vote_type フィルタ無し（全票集計）だが、
 *    シェアカードは「プルーフ（強み）票」だけを根拠にするため 'proof' に限定する。
 *    安易に strengthDistribution 側へ合わせないこと（公開ページの分布数字とは別物）。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { org_id: string } }
) {
  try {
    const orgId = params.org_id
    const supabase = getSupabaseAdmin()

    // ── 1. active メンバーの professional_id を DISTINCT 取得 ──
    // org_members は 1プロ×複数バッジ=複数行になり得るため Set で重複排除。
    const { data: memberRows, error: memberErr } = await supabase
      .from('org_members')
      .select('professional_id')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .not('professional_id', 'is', null)
    if (memberErr) throw memberErr

    const memberIds = Array.from(
      new Set((memberRows || []).map((m: any) => m.professional_id as string))
    )

    if (memberIds.length === 0) {
      return NextResponse.json({ memberCount: 0, strengths: [] })
    }

    // ── 2. votes を取得（vote_type='proof' / 1000行キャップ対策で range+order ページネーション）──
    const PAGE = 1000
    let from = 0
    const votes: { selected_proof_ids: string[] }[] = []
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from('votes')
        .select('selected_proof_ids')
        .in('professional_id', memberIds)
        .eq('vote_type', 'proof')
        .not('selected_proof_ids', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw error
      const rows = data || []
      votes.push(...rows as any)
      if (rows.length < PAGE) break
      from += PAGE
    }

    // ── 3. proof_item_id × 総カウント（全プロ合算 = 団体の強み証明数）──
    const totalByItem = new Map<string, number>()
    for (const v of votes) {
      const pids: string[] = v.selected_proof_ids || []
      for (const pid of pids) {
        totalByItem.set(pid, (totalByItem.get(pid) || 0) + 1)
      }
    }

    // ── 4. proof_item のラベル解決（proof_items.label = 項目表示名）──
    const { data: proofItems, error: piErr } = await supabase
      .from('proof_items')
      .select('id, label')
    if (piErr) throw piErr
    const labelOf = new Map<string, string>()
    for (const pi of proofItems || []) {
      labelOf.set(pi.id, pi.label || '')
    }

    // ── 5. totalCount 降順（同数は proofItemId 昇順で決定的に）。count>0 を全件返す ──
    const strengths = Array.from(totalByItem.entries())
      .filter(([, total]) => total > 0)
      .map(([proofItemId, total]) => ({
        proofItemId,
        label: labelOf.get(proofItemId) || '',
        totalCount: total,
      }))
      .sort((a, b) =>
        b.totalCount - a.totalCount ||
        a.proofItemId.localeCompare(b.proofItemId)
      )

    return NextResponse.json({
      memberCount: memberIds.length,
      strengths,
    })
  } catch (error: any) {
    console.error('[top-strengths GET] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
