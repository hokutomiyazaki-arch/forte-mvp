import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { TAB_ORDER, TAB_DISPLAY_NAMES } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/**
 * GET /api/org/[org_id]/top-pros-by-field
 *
 * 団体IGシェア用: 分野(tab)ごとの「トップのプロ」を1人ずつ返す。
 * 流用元は org-dashboard/route.ts の strengthDistribution 集計だが、以下2点が意図的に異なる:
 *
 *   ① grouping key を tab × professional_id にする（strengthDistribution は tab のみ）。
 *   ② votes を vote_type='proof' でフィルタする。
 *      ⚠️ 既存 strengthDistribution は vote_type フィルタ無し（全票集計）だが、
 *         シェアカードは「プルーフ（強み）票」だけを根拠にする設計判断のため 'proof' に限定する。
 *         この差は意図的。安易に strengthDistribution 側へ合わせない（公開ページの分布数字とは別物）。
 *
 * オプトアウト除外は「各tabのトップを決定する前」に行う。
 * トップのプロがオプトアウトしていたら、その分野は次点のプロが繰り上がる。
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

    // 票0・メンバー0 でも TAB_ORDER 全 tab を topPro:null で返す（UIが常に全分野を並べられる）
    const emptyResult = () =>
      NextResponse.json({
        tabs: TAB_ORDER.map(tab => ({
          tab,
          displayName: TAB_DISPLAY_NAMES[tab] || tab,
          topPro: null,
        })),
      })

    if (memberIds.length === 0) return emptyResult()

    // ── 2. ★オプトアウト除外（各tabトップ決定の前に実施）──
    const { data: optoutRows, error: optoutErr } = await supabase
      .from('org_share_optouts')
      .select('professional_id')
      .eq('organization_id', orgId)
      .in('professional_id', memberIds)
    if (optoutErr) throw optoutErr

    const optoutSet = new Set((optoutRows || []).map((r: any) => r.professional_id as string))
    const eligibleIds = memberIds.filter(id => !optoutSet.has(id))

    if (eligibleIds.length === 0) return emptyResult()

    // ── 3. votes を取得（vote_type='proof' / 1000行キャップ対策で range+order ページネーション）──
    const PAGE = 1000
    let from = 0
    const votes: { professional_id: string; selected_proof_ids: string[] }[] = []
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from('votes')
        .select('professional_id, selected_proof_ids')
        .in('professional_id', eligibleIds)
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

    // ── 4. proof_id → tab 解決マップ（proof_items は master・小規模なので一括取得）──
    const { data: proofItems, error: piErr } = await supabase
      .from('proof_items')
      .select('id, tab')
    if (piErr) throw piErr
    const tabOf = new Map<string, string>()
    for (const pi of proofItems || []) {
      if (pi.tab) tabOf.set(pi.id, pi.tab)
    }

    // ── 5. tab × professional_id でカウント ──
    // tabCounts[tab] = Map<professional_id, count>
    const tabCounts = new Map<string, Map<string, number>>()
    for (const v of votes) {
      const pids: string[] = v.selected_proof_ids || []
      for (const pid of pids) {
        const tab = tabOf.get(pid)
        if (!tab) continue
        if (!tabCounts.has(tab)) tabCounts.set(tab, new Map())
        const m = tabCounts.get(tab)!
        m.set(v.professional_id, (m.get(v.professional_id) || 0) + 1)
      }
    }

    // ── 6. 各tabのトップ professional_id を決定（同点は professional_id 昇順で固定）──
    const winnerByTab = new Map<string, { professional_id: string; count: number }>()
    const winnerIds = new Set<string>()
    for (const tab of TAB_ORDER) {
      const m = tabCounts.get(tab)
      if (!m || m.size === 0) continue
      let topPid = ''
      let topCount = 0
      Array.from(m.entries()).forEach(([pid, count]) => {
        if (
          count > topCount ||
          (count === topCount && (topPid === '' || pid.localeCompare(topPid) < 0))
        ) {
          topPid = pid
          topCount = count
        }
      })
      if (topPid && topCount > 0) {
        winnerByTab.set(tab, { professional_id: topPid, count: topCount })
        winnerIds.add(topPid)
      }
    }

    // ── 7. 勝者プロの表示情報を JOIN 取得 ──
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

    // ── 8. TAB_ORDER 順で返却 ──
    const tabs = TAB_ORDER.map(tab => {
      const w = winnerByTab.get(tab)
      const p = w ? proInfo.get(w.professional_id) : null
      return {
        tab,
        displayName: TAB_DISPLAY_NAMES[tab] || tab,
        topPro: w && p
          ? {
              professional_id: w.professional_id,
              name: p.name,
              photo_url: p.photo_url,
              title: p.title,
              count: w.count,
            }
          : null,
      }
    })

    return NextResponse.json({ tabs })
  } catch (error: any) {
    console.error('[top-pros-by-field GET] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
