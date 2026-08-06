import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { notifyProClientReplied } from '@/lib/consultation-notify'

export const dynamic = 'force-dynamic'

const BODY_MAX = 2000
/** 1スレッドの上限。無限に伸ばさない（メール往復のスレッドであってチャットではない）。 */
const MESSAGE_LIMIT = 100
/**
 * §16-27-2 連投制限: プロが返信するまでにクライアントが送れる通数。
 * 「返信が来ない→催促を重ねる→さらに返しづらくなる」の悪循環を止めるため。
 * フロントだけで抑えるとAPI直叩きで抜けるので、ここでも必ず数える。
 */
const CLIENT_STREAK_LIMIT = 3

/**
 * クライアント側のやりとり（§16-19）。access_token だけで開ける。
 *
 * Resend は送信専用でメールの返信を受け取れないため、送信メール内のリンクから
 * ここへ戻ってもらう。token が唯一の鍵なので、レスポンスに PII は一切載せない
 * （client_email はもちろん、プロの contact_email も出さない）。
 */
async function loadByToken(token: string) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('consultations')
    .select('id, pro_id, client_name, status, created_at')
    .eq('access_token', token)
    .maybeSingle()
  return { supabase, consultation: data }
}

/** GET /api/consultations/[token] — スレッドの表示 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    if (!token) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const { supabase, consultation } = await loadByToken(token)
    if (!consultation) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const { data: pro } = await supabase
      .from('professionals')
      .select('id, name, photo_url, booking_url')
      .eq('id', consultation.pro_id)
      .maybeSingle()

    const { data: messages } = await supabase
      .from('consultation_messages')
      .select('id, sender, body, created_at, menu_id')
      .eq('consultation_id', consultation.id)
      .order('created_at', { ascending: true })
      .limit(MESSAGE_LIMIT)

    const rows = messages || []

    // §16-27-3: 提案されたメニューをカードとして描くための情報。
    // menu_id カラムが未作成の環境では undefined になるだけ（fail-soft）。
    const menuIds = Array.from(new Set(rows.map((m: any) => m.menu_id).filter(Boolean)))
    const menuMap = new Map<string, any>()
    if (menuIds.length > 0) {
      const { data: menus } = await supabase
        .from('pro_menus')
        .select('id, name, price_text, description')
        .in('id', menuIds)
      for (const menu of menus || []) menuMap.set(menu.id, menu)
    }

    // §16-27-2: いま何通まで送れるかをフロントに渡す（サーバー側の判定と同じ数え方）。
    let clientStreak = 0
    for (let i = rows.length - 1; i >= 0; i--) {
      if ((rows[i] as any).sender === 'pro') break
      clientStreak++
    }

    return NextResponse.json({
      client_streak: clientStreak,
      streak_limit: CLIENT_STREAK_LIMIT,
      consultation: {
        client_name: consultation.client_name,
        status: consultation.status,
        created_at: consultation.created_at,
      },
      // booking_url は公開カードにも出している情報なのでPIIではない。
      // §16-26: やりとり画面に常設する予約ボタンの遷移先に使う。
      pro: pro ? { id: pro.id, name: pro.name, photo_url: pro.photo_url, booking_url: pro.booking_url } : null,
      messages: rows.map((m: any) => ({
        id: m.id,
        sender: m.sender,
        body: m.body,
        created_at: m.created_at,
        menu: m.menu_id ? menuMap.get(m.menu_id) || null : null,
      })),
    })
  } catch (err) {
    console.error('[api/consultations/[token] GET] error:', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/** POST /api/consultations/[token] — クライアントからの追記 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    if (!token) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const payload = await request.json().catch(() => null)
    const body = payload && typeof payload.body === 'string' ? payload.body.trim() : ''
    if (!body || body.length > BODY_MAX) {
      return NextResponse.json({ error: 'body_invalid' }, { status: 400 })
    }

    const { supabase, consultation } = await loadByToken(token)
    if (!consultation) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (consultation.status === 'closed') {
      return NextResponse.json({ error: 'closed' }, { status: 409 })
    }

    const { data: existing } = await supabase
      .from('consultation_messages')
      .select('sender')
      .eq('consultation_id', consultation.id)
      .order('created_at', { ascending: true })
      .limit(MESSAGE_LIMIT)

    const rows = existing || []
    if (rows.length >= MESSAGE_LIMIT) {
      return NextResponse.json({ error: 'limit_reached' }, { status: 409 })
    }

    // §16-27-2 連投制限: 最後のプロの返信より後のクライアント連投を数える。
    // 新カラムを足さずに済む（メッセージの並びだけで決まる）。
    let clientStreak = 0
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].sender === 'pro') break
      clientStreak++
    }
    if (clientStreak >= CLIENT_STREAK_LIMIT) {
      return NextResponse.json({ error: 'awaiting_reply' }, { status: 429 })
    }

    const { error: msgError } = await supabase.from('consultation_messages').insert({
      consultation_id: consultation.id,
      sender: 'client',
      body,
    })
    if (msgError) {
      console.error('[api/consultations/[token] POST] insert error:', msgError.message)
      return NextResponse.json({ error: 'send_failed' }, { status: 500 })
    }

    await supabase
      .from('consultations')
      .update({ status: 'new', updated_at: new Date().toISOString() })
      .eq('id', consultation.id)

    try {
      const { data: pro } = await supabase
        .from('professionals')
        .select('name, contact_email, line_messaging_user_id')
        .eq('id', consultation.pro_id)
        .maybeSingle()
      if (pro) {
        await notifyProClientReplied({
          proName: pro.name || '',
          contactEmail: pro.contact_email ?? null,
          lineUserId: (pro as any).line_messaging_user_id ?? null,
          clientName: consultation.client_name || '',
          body,
        })
      }
    } catch (err) {
      console.error('[api/consultations/[token] POST] notify error:', err)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/consultations/[token] POST] error:', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
