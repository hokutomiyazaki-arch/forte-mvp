import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'
import { notifyClientProReplied } from '@/lib/consultation-notify'

export const dynamic = 'force-dynamic'

const BODY_MAX = 2000
const MESSAGE_LIMIT = 100
const ALLOWED_STATUS = ['new', 'open', 'closed']

/**
 * POST /api/pro/consultations/[id] — プロが返信する（§16-19）
 * body: { body }            返信を書き込む。クライアントへメールが飛ぶ
 * body: { status }          スレッドの状態だけ変える（対応済みにする等）
 *
 * 「プロはダッシュボードで書くだけ、クライアントにはメールが届く」がこの機能の肝。
 * 送信結果は consultation_messages.delivered_at に残す（送れなかったことを後から追える）。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const payload = await request.json().catch(() => null)
    if (!payload) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

    const supabase = getSupabaseAdmin()

    // 自分宛のスレッドかを必ず確認（他人の相談を触れない）
    const { data: consultation } = await supabase
      .from('consultations')
      .select('id, pro_id, client_name, client_email, access_token, status')
      .eq('id', id)
      .maybeSingle()

    if (!consultation || consultation.pro_id !== ownPro.id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    // ── 状態変更のみ ──
    if (typeof payload.status === 'string' && payload.body === undefined) {
      if (!ALLOWED_STATUS.includes(payload.status)) {
        return NextResponse.json({ error: 'status_invalid' }, { status: 400 })
      }
      const { error } = await supabase
        .from('consultations')
        .update({ status: payload.status, updated_at: new Date().toISOString() })
        .eq('id', consultation.id)
      if (error) {
        console.error('[api/pro/consultations POST] status error:', error.message)
        return NextResponse.json({ error: 'update_failed' }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    // ── 返信 ──
    const body = typeof payload.body === 'string' ? payload.body.trim() : ''
    if (!body || body.length > BODY_MAX) {
      return NextResponse.json({ error: 'body_invalid' }, { status: 400 })
    }

    const { count } = await supabase
      .from('consultation_messages')
      .select('id', { count: 'exact', head: true })
      .eq('consultation_id', consultation.id)
    if ((count || 0) >= MESSAGE_LIMIT) {
      return NextResponse.json({ error: 'limit_reached' }, { status: 409 })
    }

    const { data: inserted, error: msgError } = await supabase
      .from('consultation_messages')
      .insert({ consultation_id: consultation.id, sender: 'pro', body })
      .select('id')
      .maybeSingle()

    if (msgError || !inserted) {
      console.error('[api/pro/consultations POST] insert error:', msgError?.message)
      return NextResponse.json({ error: 'send_failed' }, { status: 500 })
    }

    // 返信したら「対応中」へ。クライアントが追記すると 'new' に戻る。
    await supabase
      .from('consultations')
      .update({ status: 'open', updated_at: new Date().toISOString() })
      .eq('id', consultation.id)

    // メール送信。失敗しても本文は残す（delivered_at が null のままで判別できる）。
    let delivered = false
    try {
      delivered = await notifyClientProReplied({
        clientEmail: consultation.client_email,
        clientName: consultation.client_name || '',
        proName: ownPro.name || '',
        body,
        token: consultation.access_token,
      })
    } catch (err) {
      console.error('[api/pro/consultations POST] notify error:', err)
    }

    if (delivered) {
      await supabase
        .from('consultation_messages')
        .update({ delivered_at: new Date().toISOString() })
        .eq('id', inserted.id)
    }

    return NextResponse.json({ ok: true, delivered })
  } catch (err) {
    console.error('[api/pro/consultations POST] error:', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
