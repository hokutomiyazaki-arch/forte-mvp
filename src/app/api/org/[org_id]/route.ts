import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { selectInChunks } from '@/lib/supabase-batch'
import { sanitizeVoicesForDisplay } from '@/lib/voice-sanitize'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { org_id: string } }
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
    const orgId = params.org_id

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle()

    if (orgError) throw orgError
    if (!org) return NextResponse.json({ error: '団体が見つかりません' }, { status: 404 })

    const { data: orgMembersData } = await supabase
      .from('org_members')
      .select('id, professional_id, credential_level_id, status, professionals(id, name, photo_url, title)')
      .eq('organization_id', orgId)
      .eq('status', 'active')

    const allOrgMembers = orgMembersData || []

    // 2026-03-11のVercelキャッシュ問題(LESSONS.md B-1)の対策は cache:'no-store' + force-dynamic
    // (このファイル冒頭・5行目/17-18行目)であり、VIEW回避は不要だった。013_org_views.sql の
    // org_aggregate は active_member_count/total_org_votes をいずれも COUNT(DISTINCT ...) で
    // 定義しているため、直下のJS計算(Set重複排除 + .in()count)と数学的に同一の値を返す。
    // 二重実装を解消するためVIEW経由に統一する(2026-08)。
    const { data: memberCountData } = await supabase
      .from('org_members')
      .select('professional_id')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .not('professional_id', 'is', null)

    const uniqueProIds = new Set((memberCountData || []).map((m: any) => m.professional_id))
    const professionalIds = Array.from(uniqueProIds)

    const { data: orgAggregateData } = await supabase
      .from('org_aggregate')
      .select('active_member_count, total_org_votes')
      .eq('organization_id', orgId)
      .maybeSingle()

    // votes_last_30_days は org_aggregate 側が `COUNT(v.id) FILTER(...)`（DISTINCT無し）で
    // LEFT JOIN しているため、同一プロが団体内で複数バッジ(=org_membersに複数active行、
    // 例: advance/master/TBU同時保持)を持つと二重・三重カウントされ得る(JS側は
    // professionalIds が重複排除済みSetなので1回だけ数える)。そのためここはJSで計算する。
    // ※ migration 049 でVIEW側にもDISTINCTを入れたので将来はVIEWに寄せられるが、
    //   置き換えは数値の出どころを変える変更なので別タスクにする。
    //
    // 修正(2026-08-06・CEO指示): 「プルーフ数」の定義を /api/vote-count に揃える。
    // 従来は status も vote_type も絞らない生カウントで、未確認票・期待票(hopeful)・
    // 人柄のみ(personality_only)まで数えていた。continuation(2回目以降=リピーターの記録)は
    // 施術を受けた記録なので必ず含める(同日のadmin集計事故と同じ穴を作らない)。
    const PROOF_VOTE_TYPES = ['proof', 'continuation']
    let recentVotes = 0
    if (professionalIds.length > 0) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('votes')
        .select('id', { count: 'exact', head: true })
        .in('professional_id', professionalIds)
        .eq('status', 'confirmed')
        .in('vote_type', PROOF_VOTE_TYPES)
        .gte('created_at', thirtyDaysAgo)
      recentVotes = count || 0
    }

    const aggregate = {
      active_member_count: orgAggregateData?.active_member_count ?? uniqueProIds.size,
      total_org_votes: orgAggregateData?.total_org_votes ?? 0,
      votes_last_30_days: recentVotes,
    }

    // 重複排除（同一プロが複数バッジを持つ場合）+ 投票数を直接votesテーブルから取得
    const uniqueMembers = Array.from(
      new Map(allOrgMembers.map((m: any) => [m.professional_id, m])).values()
    )

    // 2026-03-11のVercelキャッシュ問題(LESSONS.md B-1)の対策は cache:'no-store' + force-dynamic
    // であり、VIEW回避は不要だった。ここは org_proof_summary VIEWへの統一を検討したが、
    // 同VIEWの total_votes は `COUNT(v.id)`(DISTINCT無し)を GROUP BY (organization_id, professional_id)
    // で集計しており、同一プロが団体内で複数バッジ(=org_membersに複数active行)を持つ場合は
    // LEFT JOINが行を複製し二重・三重カウントされる(下の重複排除ロジックが存在する理由と同じ事象)。
    // 数値を変えないためVIEWには寄せず、votesテーブルから直接集計する現行実装を維持する。
    // 真因対応(2026-08): .range() が無く、団体の総投票数が1000行を超えると無音truncateしていた。
    // 共通ヘルパー(IN句100件チャンク+range()ページネーション)で全件取得する。
    let votesMap = new Map<string, number>()
    if (professionalIds.length > 0) {
      // 修正(2026-08-06・CEO指示): メンバー別の投票数も「プルーフ数」の新定義に揃える
      // （confirmed かつ proof/continuation。上の recentVotes と同じ条件）。
      const votesPerPro = await selectInChunks<{ id: string; professional_id: string }>(
        professionalIds,
        (chunkIds, from, to) =>
          supabase
            .from('votes')
            .select('id, professional_id')
            .in('professional_id', chunkIds)
            .eq('status', 'confirmed')
            .in('vote_type', PROOF_VOTE_TYPES)
            .order('id', { ascending: true })
            .range(from, to)
      )
      const countMap: Record<string, number> = {}
      for (const v of votesPerPro) {
        countMap[v.professional_id] = (countMap[v.professional_id] || 0) + 1
      }
      votesMap = new Map(Object.entries(countMap))
    }

    const members = uniqueMembers
      .map((m: any) => ({ ...m, total_votes: votesMap.get(m.professional_id) || 0 }))
      .sort((a: any, b: any) =>
        (b.total_votes - a.total_votes) ||
        String(a.professional_id).localeCompare(String(b.professional_id))
      )

    let levelAggregates: any[] = []
    if (org.type === 'credential' || org.type === 'education') {
      const { data: levels } = await supabase
        .from('credential_levels')
        .select('*')
        .eq('organization_id', orgId)
        .order('sort_order', { ascending: true })

      // 各credential_levelごとにorg_membersから直接取得（プロのみ・VIEWキャッシュ回避）
      const levelIds = (levels || []).map((cl: any) => cl.id)
      const { data: levelMembersRaw } = await supabase
        .from('org_members')
        .select('professional_id, credential_level_id, professionals(id, name, photo_url)')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .not('credential_level_id', 'is', null)
        .not('professional_id', 'is', null)
        .in('credential_level_id', levelIds)

      // credential_level_id別にグループ化（プロのみ・professional_idで重複排除）
      const membersByLevelId = new Map<string, Map<string, any>>()
      for (const m of levelMembersRaw || []) {
        if (!m.credential_level_id || !m.professional_id) continue
        if (!membersByLevelId.has(m.credential_level_id)) {
          membersByLevelId.set(m.credential_level_id, new Map())
        }
        const levelMap = membersByLevelId.get(m.credential_level_id)!
        if (!levelMap.has(m.professional_id)) {
          levelMap.set(m.professional_id, m)
        }
      }

      levelAggregates = (levels || []).map((cl: any) => {
        const levelMap = membersByLevelId.get(cl.id)
        const membersInLevel = levelMap ? Array.from(levelMap.values()) : []
        const memberDetails = membersInLevel.map((m: any) => ({
          professional_id: m.professional_id,
          user_id: null,
          is_pro: true,
          name: m.professionals?.name || '',
          photo_url: m.professionals?.photo_url || null,
        }))
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

    // プルーフ別トップメンバー集計（professionalIdsを直接使用、org_members JOINを排除）
    let proofTopMembers: any[] = []
    let topStrengthItems: { label: string; count: number }[] = []

    if (professionalIds.length > 0) {
      // メンバーの投票でselected_proof_idsがある投票を取得（professionalIdsから直接）
      // §2-8: continuation行は selected_proof_ids を保持したまま保存されるため、
      // vote_type='proof' に絞って強み項目別集計（プルーフ別トップメンバー）から除外する。
      // normalized_email は DISTINCT 人数カウント専用（集計後に破棄。レスポンスには含めない）。
      // 真因対応(2026-08): 同上。.range() が無く1000行超で無音truncateしていたため、
      // 共通ヘルパー(IN句100件チャンク+range()ページネーション)で全件取得する。
      // バグ修正(2026-08・CEO承認): status='confirmed' の絞り込みを追加。個人カード側が使う
      // vote_summary VIEW(028_continuation_votes.sql)は vote_type='proof' AND
      // selected_proof_ids IS NOT NULL AND status='confirmed' で集計しており、この絞り込みが
      // 無いと未確認(pending)票まで数えてしまい、同じ人の数字が団体ページと個人カードで食い違う。
      // vote_summary VIEWへの完全な置き換え(JOIN)も検討したが、vote_summary は
      // COUNT(DISTINCT normalized_email) のため normalized_email が NULL の投票(LINE/電話番号登録者)を
      // 0人扱いで切り捨てる。一方この下のロジックは normalized_email が無い票を v.id フォールバックで
      // 1人として個別カウントする設計(直下のコメント参照)であり、両者の挙動は異なる。今回の承認スコープは
      // confirmed絞り込みのみのため、null-email挙動を変えないよう置き換えは行わず、この生集計に
      // status='confirmed' を追加するに留める。
      const votesWithProofs = await selectInChunks<{
        id: string
        professional_id: string
        selected_proof_ids: string[] | null
        normalized_email: string | null
      }>(
        professionalIds,
        (chunkIds, from, to) =>
          supabase
            .from('votes')
            .select('id, professional_id, selected_proof_ids, normalized_email')
            .in('professional_id', chunkIds)
            .eq('vote_type', 'proof')
            .eq('status', 'confirmed')
            .not('selected_proof_ids', 'is', null)
            .order('id', { ascending: true })
            .range(from, to)
      )

      if (votesWithProofs.length > 0) {
        // proof_item_id ごと × professional_id ごとの集計
        // §2-8(中B): 票数ではなく人数（DISTINCT normalized_email）でカウントする。
        // vote_summary の STEP4 DISTINCT化後のカード表示（同一プロ×同一項目）と数値を一致させるため。
        // email が無い投票は id をフォールバックキーにして個別カウントする（重複判定不能なため）。
        const proofProMap: Record<string, Record<string, Set<string>>> = {}

        for (const v of votesWithProofs) {
          const proofIds: string[] = v.selected_proof_ids || []
          const voterKey = v.normalized_email || v.id
          for (const pid of proofIds) {
            if (!proofProMap[pid]) proofProMap[pid] = {}
            if (!proofProMap[pid][v.professional_id]) proofProMap[pid][v.professional_id] = new Set<string>()
            proofProMap[pid][v.professional_id].add(voterKey)
          }
        }

        // proofTotalMap: 項目別の団体合計人数 = 各プロのDISTINCT人数の合計
        // （同一人物が団体内の複数プロに投票した場合はプロごとに1人としてカウントされる。
        //   vote_summary が professional_id×proof_id 単位のDISTINCTである以上、org合計もその単純合算とする）
        const proofTotalMap: Record<string, number> = {}
        for (const [pid, proMapForItem] of Object.entries(proofProMap)) {
          let total = 0
          for (const voterSet of Object.values(proMapForItem)) total += voterSet.size
          proofTotalMap[pid] = total
        }

        // proof_itemsのラベルを取得
        const proofItemIds = Object.keys(proofProMap)
        if (proofItemIds.length > 0) {
          const { data: proofItems } = await supabase
            .from('proof_items')
            .select('id, label')
            .in('id', proofItemIds)

          const labelMap = new Map((proofItems || []).map((p: any) => [p.id, p.label]))

          // プロ情報マップ（allOrgMembersから構築、professionalIds全員をカバー）
          const proMap = new Map<string, { name: string; photo_url: string | null }>()
          for (const m of allOrgMembers) {
            if (m.professional_id && !proMap.has(m.professional_id)) {
              const pro = m.professionals as any
              proMap.set(m.professional_id, {
                name: pro?.name || '',
                photo_url: pro?.photo_url || null,
              })
            }
          }

          // 各proof_itemでトップのprofessionalを特定
          const rankings = proofItemIds
            .map(proofId => {
              const proCounts = proofProMap[proofId]
              let topProId = ''
              let topCount = 0
              for (const [proId, voterSet] of Object.entries(proCounts)) {
                if (voterSet.size > topCount) {
                  topProId = proId
                  topCount = voterSet.size
                }
              }
              const proInfo = proMap.get(topProId)
              return {
                proof_label: labelMap.get(proofId) || '',
                top_professional_id: topProId,
                top_name: proInfo?.name || '',
                top_photo_url: proInfo?.photo_url || null,
                vote_count: topCount,
                total_voters: proofTotalMap[proofId] || 0,
              }
            })
            .filter(r => r.proof_label)
            .sort((a, b) => b.total_voters - a.total_voters)
            .slice(0, 10)

          proofTopMembers = rankings

          // 個別強みランキング（proof_item_id別、label使用、TOP5）
          topStrengthItems = proofItemIds
            .map(proofId => ({
              label: labelMap.get(proofId) || '',
              count: proofTotalMap[proofId] || 0,
            }))
            .filter(item => item.label)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
        }
      }
    }

    // 最新コメント取得（professional_idベースで直接、org_members JOINなし）
    let recentComments: any[] = []
    if (professionalIds.length > 0) {
      // 修正(2026-08-06・CEO指示): 未確認票のコメントまで出していた。
      // 公開カードのVoices(card-data.ts)は status='confirmed' で絞っており、
      // 「団体ダッシュボードには出るのに他には出ない」ズレの原因になっていた。
      // 削除済みコメントの除外も公開カードに揃える。
      const { data: commentsRaw } = await supabase
        .from('votes')
        .select('id, comment, professional_id, created_at')
        .in('professional_id', professionalIds)
        .eq('status', 'confirmed')
        .not('comment', 'is', null)
        .neq('comment', '')
        .neq('comment', '[deleted]')
        .order('created_at', { ascending: false })
        .limit(4)

      if (commentsRaw && commentsRaw.length > 0) {
        // プロ情報マップ（allOrgMembersから構築済みのデータを再利用）
        const commentProMap = new Map<string, string>()
        for (const m of allOrgMembers) {
          if (m.professional_id && !commentProMap.has(m.professional_id)) {
            const pro = m.professionals as any
            commentProMap.set(m.professional_id, pro?.name || '')
          }
        }

        // §2-6広域適用(2026-08-08 CEO GO): 団体ダッシュボードの最新コメントも
        // 紹介URLと同じAI変換を通す。変換不能(非表示)の票は配列から除外する。
        const sanitizedMap = await sanitizeVoicesForDisplay(
          commentsRaw.map((c: any) => ({ voteId: c.id, text: c.comment as string }))
        )

        recentComments = commentsRaw
          .map((c: any) => ({
            comment: sanitizedMap.get(c.id) ?? null,
            professional_name: commentProMap.get(c.professional_id) || '',
            professional_id: c.professional_id,
            created_at: c.created_at,
          }))
          .filter((c) => !!c.comment)
      }
    }

    // §2-5育成プルーフ: 団体ページ上部の「代表：〇〇 →」表示用。CEO指示(2026-08-05)により
    // 手動 growth_role='founder' 依存をやめ、organizations.owner_id(Clerk userId) ==
    // professionals.user_id の自動判定に変更(団体を作れば自動的に代表として表示される)。
    // fail-soft: エラー時はfounders:[]で既存レスポンスを壊さない。
    let founders: { id: string; name: string; photo_url: string | null }[] = []
    try {
      if (org.owner_id) {
        const { data: ownerPros } = await supabase
          .from('professionals')
          .select('id, name, photo_url, deactivated_at')
          .eq('user_id', org.owner_id)
          .is('deactivated_at', null)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of (ownerPros || []) as any[]) {
          if (!p?.id) continue
          founders.push({ id: p.id, name: p.name || '', photo_url: p.photo_url || null })
        }
      }
    } catch (e) {
      // fail-soft: 予期しないエラーでも団体ページ全体を落とさない
      console.error('founders fetch error (fail-soft, returning []):', e)
      founders = []
    }

    return NextResponse.json({ org, members, aggregate, levelAggregates, proofTopMembers, topStrengthItems, recentComments, founders })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
