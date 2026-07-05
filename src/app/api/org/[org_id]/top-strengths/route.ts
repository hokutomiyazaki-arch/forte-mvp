import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/org/[org_id]/top-strengths
 *
 * 団体IGシェア用: 団体が証明してきた「強み(proof_item単位)」を証明数の多い順に並べ、
 * 各強みに「団体内でその強みを最も証明されている代表プロ」の顔写真+名前を添えて返す。
 *
 * 集計の土台（proofフィルタ / range()ページネーション / 同点処理 / オプトアウト）は
 * 旧 top-pros-by-field / org-dashboard の strengthDistribution から流用。
 *
 * ⚠️ votes を vote_type='proof' でフィルタする点は意図的な設計判断。
 *    既存 strengthDistribution は vote_type フィルタ無し（全票集計）だが、
 *    シェアカードは「プルーフ（強み）票」だけを根拠にするため 'proof' に限定する。
 *    安易に strengthDistribution 側へ合わせないこと（公開ページの分布数字とは別物）。
 *
 * 2種類のカウントを作る:
 *   (a) proof_item_id × 総カウント（全プロ合算・オプトアウト込み）= 団体の強み証明数。
 *       数字は団体の資産なので、オプトアウトしたプロの票も消さない。
 *   (b) proof_item_id × professional_id カウント = 各強みの代表プロ決定用。
 *       ★代表プロを選ぶ時だけオプトアウト集合を除外し、いなくなれば次点が繰り上がる。
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
      return NextResponse.json({ memberCount: 0, optoutCount: 0, strengths: [] })
    }

    // ── 2. オプトアウト集合（当該orgのみ・メンバー範囲に限定）──
    const { data: optoutRows, error: optoutErr } = await supabase
      .from('org_share_optouts')
      .select('professional_id')
      .eq('organization_id', orgId)
      .in('professional_id', memberIds)
    if (optoutErr) throw optoutErr
    const optoutSet = new Set((optoutRows || []).map((r: any) => r.professional_id as string))

    // ── 3. votes を取得（vote_type='proof' / 1000行キャップ対策で range+order ページネーション）──
    // totalCount はオプトアウト込みで数えるため、eligible ではなく memberIds 全員の票を取る。
    const PAGE = 1000
    let from = 0
    const votes: { professional_id: string; selected_proof_ids: string[] }[] = []
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from('votes')
        .select('professional_id, selected_proof_ids')
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

    // ── 4. 2種類のカウント ──
    // (a) proof_item_id → 総カウント（オプトアウト込み）
    const totalByItem = new Map<string, number>()
    // (b) proof_item_id → Map<professional_id, count>
    const byItemPro = new Map<string, Map<string, number>>()
    for (const v of votes) {
      const pids: string[] = v.selected_proof_ids || []
      for (const pid of pids) {
        totalByItem.set(pid, (totalByItem.get(pid) || 0) + 1)
        if (!byItemPro.has(pid)) byItemPro.set(pid, new Map())
        const m = byItemPro.get(pid)!
        m.set(v.professional_id, (m.get(v.professional_id) || 0) + 1)
      }
    }

    // ── 5. 各 proof_item の代表プロ決定（オプトアウト除外・同点は professional_id 昇順）──
    const repByItem = new Map<string, { professional_id: string; count: number }>()
    const winnerIds = new Set<string>()
    for (const [pid, proMap] of Array.from(byItemPro.entries())) {
      let topPid = ''
      let topCount = 0
      Array.from(proMap.entries()).forEach(([proId, count]) => {
        if (optoutSet.has(proId)) return // ★代表選出からオプトアウトを除外
        if (
          count > topCount ||
          (count === topCount && (topPid === '' || proId.localeCompare(topPid) < 0))
        ) {
          topPid = proId
          topCount = count
        }
      })
      if (topPid && topCount > 0) {
        repByItem.set(pid, { professional_id: topPid, count: topCount })
        winnerIds.add(topPid)
      }
      // 全員オプトアウト等で候補が残らなければ repByItem 無し → topPro:null
    }

    // ── 6. proof_item のラベル解決（proof_items.label = 項目表示名）──
    const { data: proofItems, error: piErr } = await supabase
      .from('proof_items')
      .select('id, label')
    if (piErr) throw piErr
    const labelOf = new Map<string, string>()
    for (const pi of proofItems || []) {
      labelOf.set(pi.id, pi.label || '')
    }

    // ── 7. 代表プロの表示情報を JOIN 取得 ──
    const proInfo = new Map<string, any>()
    if (winnerIds.size > 0) {
      const { data: pros, error: proErr } = await supabase
        .from('professionals')
        .select('id, name, photo_url, title')
        .in('id', Array.from(winnerIds))
      if (proErr) throw proErr
      for (const p of pros || []) {
        proInfo.set(p.id, p)
      }
    }

    // ── 8. totalCount 降順で並べる（count>0 の proof_item を全部返す。UI側で上位を選ぶ）──
    // 同数の並びを決定的にするため、同 totalCount では proofItemId 昇順で固定。
    const strengths = Array.from(totalByItem.entries())
      .filter(([, total]) => total > 0)
      .map(([proofItemId, total]) => {
        const rep = repByItem.get(proofItemId)
        const p = rep ? proInfo.get(rep.professional_id) : null
        return {
          proofItemId,
          label: labelOf.get(proofItemId) || '',
          totalCount: total,
          topPro: rep && p
            ? {
                professionalId: rep.professional_id,
                name: p.name,
                photoUrl: p.photo_url,
                title: p.title,
                count: rep.count,
              }
            : null,
        }
      })
      .sort((a, b) =>
        b.totalCount - a.totalCount ||
        a.proofItemId.localeCompare(b.proofItemId)
      )

    return NextResponse.json({
      memberCount: memberIds.length,
      optoutCount: optoutSet.size,
      strengths,
    })
  } catch (error: any) {
    console.error('[top-strengths GET] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
