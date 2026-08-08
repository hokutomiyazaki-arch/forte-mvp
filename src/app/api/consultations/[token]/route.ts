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
      .select('id, name, photo_url, booking_url, booking_enabled')
      .eq('id', consultation.pro_id)
      .maybeSingle()

    // §17-1: 予約の受け方（RPネイティブ / 本人のサイト）。migration 056 依存カラムのため、
    // 上のselectには足さず別クエリ＋fail-softで読む（未作成カラムを明示selectすると42703で
    // クエリ全体が落ち、やりとり画面が真っ白になる。同じ事故を2026-08-06に起こしている）。
    let proBookingMode: string | null = null
    try {
      const { data: modeRow } = await supabase
        .from('professionals')
        .select('booking_mode')
        .eq('id', consultation.pro_id)
        .maybeSingle()
      proBookingMode = (modeRow as { booking_mode?: string | null } | null)?.booking_mode ?? null
    } catch {
      // カラム未作成: 未選択として扱う（booking_url の有無で解釈される）
    }

    const { data: messages } = await supabase
      .from('consultation_messages')
      // 教訓(2026-08-06・本番事故): 未作成カラムを .select() に明示すると PostgREST が
      // 42703 で落ち、**メッセージが1件も返らなくなる**（クライアント側が真っ白になった）。
      // migration の実行順に依存させないため、ここは * にして任意カラムは後段で読む。
      // 同じ事故が card-data.ts の delegate_criteria でも起きている（LESSONS参照）。
      .select('*')
      .eq('consultation_id', consultation.id)
      .order('created_at', { ascending: true })
      .limit(MESSAGE_LIMIT)

    const allRows = messages || []
    // §16-36: 取り消されたメッセージは**どちらの画面にも出さない**（CEO決定 2026-08-06）。
    // 行は残すが表示はしない。migration 055 未実行なら undefined なので素通りする。
    const rows = allRows.filter((m: any) => !m.withdrawn_at)

    // §16-27-3: 提案されたメニューをカードとして描くための情報。
    // menu_id カラムが未作成の環境では undefined になるだけ（fail-soft）。
    // §16-35: プロが送った紹介リスト。カードにして「見る」導線を出す。
    const listIds = Array.from(new Set(rows.map((m: any) => m.list_id).filter(Boolean)))
    const listMap = new Map<string, any>()
    if (listIds.length > 0) {
      const { data: lists } = await supabase
        .from('referral_lists')
        .select('id, title, comment, slug')
        .in('id', listIds)
      for (const l of lists || []) listMap.set(l.id, l)
    }

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
    // ⚠️ 数えるのは取り消し前の全件(allRows)。取り消した分を数え直すと
    //    「3通送る→取り消す→また3通送れる」で連投制限を抜けられてしまう。
    let clientStreak = 0
    for (let i = allRows.length - 1; i >= 0; i--) {
      if ((allRows[i] as any).sender === 'pro') break
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
      pro: pro
        ? {
            id: pro.id,
            name: pro.name,
            photo_url: pro.photo_url,
            booking_url: pro.booking_url,
            // §16-29: 予約を止めているプロには予約導線を出さない（クライアント側で判定に使う）
            booking_enabled: (pro as any).booking_enabled !== false,
            // §17-1: 予約の受け方。クライアント側で resolveBookingTarget に渡す。
            booking_mode: proBookingMode,
          }
        : null,
      messages: rows.map((m: any) => ({
        id: m.id,
        sender: m.sender,
        body: m.body,
        created_at: m.created_at,
        menu: m.menu_id ? menuMap.get(m.menu_id) || null : null,
        list: m.list_id ? listMap.get(m.list_id) || null : null,
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
    if (!payload) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

    const { supabase, consultation } = await loadByToken(token)
    if (!consultation) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    // ── 送信の取り消し（§16-36・CEO決定 2026-08-06）──
    // プロ側と同じ扱いをクライアントにも用意する（誤送信は相談する側にも起きる）。
    // 「相手の画面からも消えるけど、システムには残る」＝論理削除。
    // ⚠️ メールは既に出ているので送信自体は取り消せない。UI側で必ずそう書くこと。
    // スレッドが closed でも取り消せる（誤送信を残し続けるほうが害が大きい）。
    if (typeof payload.undo_message_id === 'string' && payload.undo_message_id) {
      const { data: msg } = await supabase
        .from('consultation_messages')
        .select('id, consultation_id, sender')
        .eq('id', payload.undo_message_id)
        .maybeSingle()

      // このスレッドの、自分(client)の発言だけ
      if (!msg || msg.consultation_id !== consultation.id || msg.sender !== 'client') {
        return NextResponse.json({ error: 'message_not_found' }, { status: 404 })
      }

      const { error } = await supabase
        .from('consultation_messages')
        .update({ withdrawn_at: new Date().toISOString() })
        .eq('id', msg.id)
      if (error) {
        // fail-soft: migration 055 未実行の環境では withdrawn_at が無い。
        // 取り消せないまま残るほうが害が大きいので物理削除で通す（CEO「物理削除でok」）。
        console.error('[api/consultations/[token] POST] undo error:', error.message)
        const fallback = await supabase.from('consultation_messages').delete().eq('id', msg.id)
        if (fallback.error) {
          console.error('[api/consultations/[token] POST] undo delete error:', fallback.error.message)
          return NextResponse.json({ error: 'undo_failed' }, { status: 500 })
        }
      }
      return NextResponse.json({ ok: true })
    }

    const body = typeof payload.body === 'string' ? payload.body.trim() : ''
    if (!body || body.length > BODY_MAX) {
      return NextResponse.json({ error: 'body_invalid' }, { status: 400 })
    }

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
    // 取り消し済み(§16-36)も**数に入れたまま**にする。除くと
    // 「3通送る→取り消す→また3通送れる」で制限を抜けられる。
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
