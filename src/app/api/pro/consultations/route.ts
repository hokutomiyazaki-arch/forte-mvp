import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'

export const dynamic = 'force-dynamic'

/** 一覧に載せるスレッド数の上限（ページネーションは必要になってから）。 */
const THREAD_LIMIT = 100

/**
 * GET /api/pro/consultations — 自分宛の相談一覧（§16-19）
 *
 * PII について:
 *   client_email は **このエンドポイントだけ** が返す。プロ本人のダッシュボード表示用で、
 *   §16-19 の狙い②「クライアントリストが取れる」がここに当たる。
 *   公開側 (/api/consultations/[token]) には絶対に出さない。
 *
 * access_token も返さない。プロ側の操作は consultation の id で足りるし、
 * token はクライアントの鍵なのでプロ側に配る理由が無い。
 */
export async function GET(request: Request) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const supabase = getSupabaseAdmin()
    // CEO指示(2026-08-06): アーカイブしたスレッドは既定で一覧に出さない。
    // ?archived=1 で「アーカイブ済みだけ」を見返せる。
    const archivedOnly = new URL(request.url).searchParams.get('archived') === '1'

    // ?countOnly=1: タブの未返信バッジ用。本文まで引かずに件数だけ返す
    // （バッジは相談タブを開く前に出したいので、一覧とは別に軽く叩けるようにする）。
    if (new URL(request.url).searchParams.get('countOnly') === '1') {
      const { count } = await supabase
        .from('consultations')
        .select('id', { count: 'exact', head: true })
        .eq('pro_id', ownPro.id)
        .eq('status', 'new')
      return NextResponse.json({ unread: count || 0 })
    }

    let threadQuery = supabase
      .from('consultations')
      .select('id, client_name, client_email, status, created_at, updated_at')
      .eq('pro_id', ownPro.id)
    threadQuery = archivedOnly
      ? threadQuery.eq('status', 'archived')
      : threadQuery.neq('status', 'archived')
    const { data: threads } = await threadQuery
      .order('updated_at', { ascending: false })
      .limit(THREAD_LIMIT)

    const list = threads || []
    if (list.length === 0) return NextResponse.json({ consultations: [] })

    // 本文は1クエリでまとめて取り、JS側でスレッドに割り当てる（N+1を作らない）
    const ids = list.map(t => t.id)
    const { data: messages } = await supabase
      .from('consultation_messages')
      .select('id, consultation_id, sender, body, created_at')
      .in('consultation_id', ids)
      .order('created_at', { ascending: true })

    const byThread = new Map<string, any[]>()
    for (const m of messages || []) {
      if (!byThread.has(m.consultation_id)) byThread.set(m.consultation_id, [])
      byThread.get(m.consultation_id)!.push(m)
    }

    return NextResponse.json({
      consultations: list.map(t => ({
        ...t,
        messages: byThread.get(t.id) || [],
      })),
    })
  } catch (err) {
    console.error('[api/pro/consultations GET] error:', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
