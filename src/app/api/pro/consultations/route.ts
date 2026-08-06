import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'

export const dynamic = 'force-dynamic'

/** 一覧に載せるスレッド数の上限（ページネーションは必要になってから）。 */
const THREAD_LIMIT = 100

/**
 * GET /api/pro/consultations — 自分宛の相談一覧（§16-19）
 *
 * PII について:
 *   client_email は **どこにも返さない**（CEO決定 2026-08-06「完全に消して。リードはこっちで握る」）。
 *   返信はダッシュボードに書けばメールが飛ぶので、プロ側がアドレスを持つ必要がない。
 *   UIから消すだけでなくレスポンスからも外す（開発者ツールで見えては意味がないため）。
 *   クライアントのメールアドレスは REAL PROOF 側の資産として DB にのみ保持する。
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
      .select('id, client_name, status, created_at, updated_at')
      .eq('pro_id', ownPro.id)
    threadQuery = archivedOnly
      ? threadQuery.eq('status', 'archived')
      : threadQuery.neq('status', 'archived')
    const { data: threads } = await threadQuery
      .order('updated_at', { ascending: false })
      .limit(THREAD_LIMIT)

    // 相談の受付スイッチの現在値（§16-25）。カラム未作成なら null が返るので
    // その場合は「受け付ける」として扱う（fail-soft）。
    const { data: settings } = await supabase
      .from('professionals')
      .select('consultation_enabled')
      .eq('id', ownPro.id)
      .maybeSingle()
    const accepting = (settings as any)?.consultation_enabled !== false

    // §16-27-3: 提案できるメニュー。「予約可能なメニュー」の既存定義に揃える
    // （is_active × price_jpy > 0 × is_referral_bookable）。ここがズレると
    // 提案できるのに予約できない、が起きる。
    const { data: menus } = await supabase
      .from('pro_menus')
      .select('id, name, price_text, price_jpy, is_referral_bookable, is_active')
      .eq('professional_id', ownPro.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
    const bookableMenus = (menus || [])
      .filter((m: any) => m.is_referral_bookable === true && Number(m.price_jpy) > 0)
      .map((m: any) => ({ id: m.id, name: m.name, price_text: m.price_text }))

    const list = threads || []
    if (list.length === 0) {
      return NextResponse.json({ consultations: [], accepting, menus: bookableMenus })
    }

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
      accepting,
      menus: bookableMenus,
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

/**
 * PATCH /api/pro/consultations — 相談の受付スイッチ（§16-25）
 * body: { accepting: boolean }
 *
 * 既存の accepting_status とは別軸。「予約は受けたいが相談はしたくない」を表せるようにする。
 * 巻き込み防止のため accepting_status には一切触らない。
 */
export async function PATCH(request: NextRequest) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const payload = await request.json().catch(() => null)
    if (!payload || typeof payload.accepting !== 'boolean') {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('professionals')
      .update({ consultation_enabled: payload.accepting })
      .eq('id', ownPro.id)

    if (error) {
      // migration 051 未実行だとここに来る（カラムが無い）。
      // 黙って成功にするとスイッチが戻って見えるので、必ず失敗として返す。
      console.error('[api/pro/consultations PATCH] error:', error.message)
      return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, accepting: payload.accepting })
  } catch (err) {
    console.error('[api/pro/consultations PATCH] error:', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
