import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { isAcceptingOpen } from '@/lib/referral-accepting'
import { sanitizeVoicesForDisplay } from '@/lib/voice-sanitize'

export const dynamic = 'force-dynamic'

/**
 * GET /api/referral/delegate-search?org_id=xxx&q=yyy&exclude_id=zzz
 *
 * §16-15（CEO決定・2026-08-06）: 停止中プロの公開カード(/card/[id])に出す代理案内の
 * 「他のお悩みで探す」検索窓の専用API。§16-14の自動抽出(本人の強みTOP3に近い最大4名)だけでは
 * 応えられない悩みのための逃げ道。
 *
 * 検索範囲は org_id で指定した団体の受付中(open)メンバーに限定する
 * （全プロ検索にすると「◯◯が認定したプロ」という保証が消えるため・§16-15）。
 * 検索対象は名前・肩書き・強み項目のラベル・**クライアントの声(コメント本文)**。
 * CEO指示(2026-08-06): 「プロを探す」の検索ボックスと同じ挙動にする(＝voice検索)。
 * 違いは団体(org_id)で範囲を絞っている点だけ。/api/search と同じく、
 * ヒットしたコメントは前後20字の抜粋を返してUIに出す(何がヒットしたか見せる)。
 * PII非送出: professionals公開項目(name/title/photo_url/prefecture)のみ返す。normalized_email等は含めない。
 * 160名規模でも全件送出しない: qが空の間・org内マッチが無い間は空配列を返す(全件フェッチしない)。
 */

/** ilikeパターンの特殊文字(% _)をエスケープし、PostgRESTのフィルタ構文で意味を持つカンマは除去する */
function sanitizeIlikeQuery(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, '')
}

interface ResultPro {
  proId: string
  name: string
  photoUrl: string | null
  title: string | null
  prefecture: string | null
  matchedProofLabels: string[]
  lastProofAt: string | null
  /** voice検索でヒットしたコメントの抜粋(前後20字)。ヒットしていなければ null。 */
  matchedVoice: string | null
  /** ヒットしたコメントの件数。 */
  matchedVoiceCount: number
}

const RESULT_LIMIT = 20

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = (searchParams.get('org_id') || '').trim()
    const q = (searchParams.get('q') || '').trim()
    const excludeId = (searchParams.get('exclude_id') || '').trim()

    if (!orgId || !q) {
      return NextResponse.json({ professionals: [] })
    }

    const supabase = getSupabaseAdmin()
    const safeQ = sanitizeIlikeQuery(q)

    // 団体の受付中メンバー(active・removed_atなし)をまず絞る(全プロ検索にしない・§16-15)
    const { data: memberRows } = await supabase
      .from('org_members')
      .select('professional_id')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .is('removed_at', null)
      .not('professional_id', 'is', null)
    const memberIds = Array.from(
      new Set(
        ((memberRows || []) as Array<{ professional_id: string | null }>)
          .map((m) => m.professional_id)
          .filter((id): id is string => !!id && id !== excludeId)
      )
    )
    if (memberIds.length === 0) {
      return NextResponse.json({ professionals: [] })
    }

    const { data: memberPros } = await supabase
      .from('professionals')
      .select('id, name, title, photo_url, prefecture, accepting_status, deactivated_at')
      .in('id', memberIds)
    const openMembers = ((memberPros || []) as Array<{
      id: string
      name: string
      title: string | null
      photo_url: string | null
      prefecture: string | null
      accepting_status: string | null
      deactivated_at: string | null
    }>).filter((p) => !p.deactivated_at && isAcceptingOpen(p.accepting_status))
    if (openMembers.length === 0) {
      return NextResponse.json({ professionals: [] })
    }
    const openMemberIds = openMembers.map((p) => p.id)
    const proMap = new Map(openMembers.map((p) => [p.id, p]))

    // ① 名前・肩書きの部分一致(受付中メンバーの範囲内のみ)
    const { data: nameMatchRows } = await supabase
      .from('professionals')
      .select('id')
      .in('id', openMemberIds)
      .or(`name.ilike.%${safeQ}%,title.ilike.%${safeQ}%`)
    const nameMatchedIds = ((nameMatchRows || []) as Array<{ id: string }>).map((r) => r.id)

    // ② 強み項目ラベルの部分一致(proof_items.label ilike q → vote_summaryで実績のあるメンバー)
    const { data: proofItemRows } = await supabase
      .from('proof_items')
      .select('id, label')
      .ilike('label', `%${safeQ}%`)
    const matchedProofRows = (proofItemRows || []) as Array<{ id: string; label: string }>
    const labelById = new Map(matchedProofRows.map((r) => [r.id, r.label]))
    const matchedProofIds = matchedProofRows.map((r) => r.id)

    const matchLabelsByMember = new Map<string, string[]>()
    if (matchedProofIds.length > 0) {
      const { data: summaryRows } = await supabase
        .from('vote_summary')
        .select('professional_id, proof_id')
        .in('professional_id', openMemberIds)
        .in('proof_id', matchedProofIds)
        .gt('vote_count', 0)
      for (const row of (summaryRows || []) as Array<{ professional_id: string; proof_id: string }>) {
        const label = labelById.get(row.proof_id)
        if (!label) continue
        if (!matchLabelsByMember.has(row.professional_id)) matchLabelsByMember.set(row.professional_id, [])
        const arr = matchLabelsByMember.get(row.professional_id)!
        if (!arr.includes(label)) arr.push(label)
      }
    }
    const proofMatchedIds = Array.from(matchLabelsByMember.keys())

    // ③ クライアントの声(コメント本文)の部分一致。CEO指示(2026-08-06)で追加。
    //    /api/search と同じ「voice検索」。ilikeではなくJS側でincludesするのは、
    //    抜粋(前後20字)を作るのに本文が要るため。件数は団体メンバーに絞られている。
    const voiceMatchByMember = new Map<string, string>()
    const voiceCountByMember = new Map<string, number>()
    // §2-6広域適用(2026-08-08 CEO GO): 後段でAI変換するため、抜粋の元になった全文とvote_idを
    // 別途保持する(voiceMatchByMemberは既存どおり「抜粋済み文字列」のまま)。
    const voiceFullTextByMember = new Map<string, string>()
    const voiceVoteIdByMember = new Map<string, string>()
    {
      const PAGE_C = 1000
      let from = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from('votes')
          .select('id, professional_id, comment')
          .in('professional_id', openMemberIds)
          .eq('status', 'confirmed')
          .not('comment', 'is', null)
          .neq('comment', '')
          .neq('comment', '[deleted]')
          .order('id', { ascending: true })
          .range(from, from + PAGE_C - 1)
        if (error) break
        const rows = (data || []) as Array<{ id: string; professional_id: string; comment: string }>
        for (const row of rows) {
          if (!row.comment || !row.comment.includes(q)) continue
          voiceCountByMember.set(row.professional_id, (voiceCountByMember.get(row.professional_id) || 0) + 1)
          if (!voiceMatchByMember.has(row.professional_id)) {
            const idx = row.comment.indexOf(q)
            const start = Math.max(0, idx - 20)
            const end = Math.min(row.comment.length, idx + q.length + 20)
            voiceMatchByMember.set(
              row.professional_id,
              `${start > 0 ? '…' : ''}${row.comment.slice(start, end)}${end < row.comment.length ? '…' : ''}`,
            )
            voiceFullTextByMember.set(row.professional_id, row.comment)
            voiceVoteIdByMember.set(row.professional_id, row.id)
          }
        }
        if (rows.length < PAGE_C) break
        from += PAGE_C
      }
    }

    // §2-6広域適用(2026-08-08 CEO GO): voiceマッチの抜粋も紹介URLと同じAI変換を通す。
    // マッチ判定自体(上のループ)は原文で行い、ここでは表示文字列だけを差し替える/非表示にする。
    {
      const sanitizeTargets = Array.from(voiceVoteIdByMember.entries())
        .map(([proId, voteId]) => {
          const text = voiceFullTextByMember.get(proId)
          return text ? { voteId, text } : null
        })
        .filter((t): t is { voteId: string; text: string } => !!t)
      const sanitizedMap = sanitizeTargets.length > 0
        ? await sanitizeVoicesForDisplay(sanitizeTargets)
        : new Map<string, string | null>()

      voiceVoteIdByMember.forEach((voteId, proId) => {
        const sanitized = sanitizedMap.get(voteId)
        if (!sanitized) {
          voiceMatchByMember.delete(proId)
          return
        }
        const idx = sanitized.indexOf(q)
        if (idx !== -1) {
          const start = Math.max(0, idx - 20)
          const end = Math.min(sanitized.length, idx + q.length + 20)
          voiceMatchByMember.set(
            proId,
            `${start > 0 ? '…' : ''}${sanitized.slice(start, end)}${end < sanitized.length ? '…' : ''}`,
          )
        } else {
          voiceMatchByMember.set(proId, sanitized.length > 40 ? sanitized.slice(0, 40) + '...' : sanitized)
        }
      })
    }

    const voiceMatchedIds = Array.from(voiceMatchByMember.keys())

    const matchedIds = Array.from(new Set([...nameMatchedIds, ...proofMatchedIds, ...voiceMatchedIds]))
    if (matchedIds.length === 0) {
      return NextResponse.json({ professionals: [] })
    }

    // 最終プルーフ日(vote_type='proof' AND status='confirmed'のcreated_at最大値)。
    // matchedIdsは団体メンバーの一部だが、CLAUDE.mdの規律に合わせ.range()+.order('id')で防御的に
    // ページネーションする(referral-delegate-criteria.tsと同じパターン)。
    const PAGE = 1000
    const lastProofByMember = new Map<string, string>()
    {
      let from = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from('votes')
          .select('id, professional_id, created_at')
          .in('professional_id', matchedIds)
          .eq('vote_type', 'proof')
          .eq('status', 'confirmed')
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) break
        const rows = (data || []) as Array<{ professional_id: string; created_at: string }>
        for (const row of rows) {
          const current = lastProofByMember.get(row.professional_id)
          if (!current || row.created_at > current) lastProofByMember.set(row.professional_id, row.created_at)
        }
        if (rows.length < PAGE) break
        from += PAGE
      }
    }

    const results: ResultPro[] = matchedIds
      .map((id) => {
        const pro = proMap.get(id)
        if (!pro) return null
        return {
          proId: id,
          name: pro.name,
          photoUrl: pro.photo_url,
          title: pro.title,
          prefecture: pro.prefecture,
          matchedProofLabels: matchLabelsByMember.get(id) || [],
          lastProofAt: lastProofByMember.get(id) || null,
          // voice検索のヒット。UI側で「〜という声があります」として出す
          matchedVoice: voiceMatchByMember.get(id) || null,
          matchedVoiceCount: voiceCountByMember.get(id) || 0,
        }
      })
      .filter((c): c is ResultPro => !!c)
      // §16-15: 並び順は§16-14と同じく最終プルーフ日が新しい順(日付無しは最後尾)
      .sort((a, b) => {
        if (!a.lastProofAt && !b.lastProofAt) return 0
        if (!a.lastProofAt) return 1
        if (!b.lastProofAt) return -1
        return b.lastProofAt.localeCompare(a.lastProofAt)
      })
      .slice(0, RESULT_LIMIT)

    return NextResponse.json({ professionals: results })
  } catch (err: any) {
    console.error('[api/referral/delegate-search] GET error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
