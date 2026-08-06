import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'
import { notifyClientProReplied } from '@/lib/consultation-notify'

export const dynamic = 'force-dynamic'

const BODY_MAX = 2000
const MESSAGE_LIMIT = 100
// CEO指示(2026-08-06): アーカイブ＝ダッシュボードの一覧から隠す状態。
// 新カラムを作らず status の値として持つ（migration 050 のメモ参照）。
const ALLOWED_STATUS = ['new', 'open', 'closed', 'archived']

/**
 * POST /api/pro/consultations/[id] — プロが返信する（§16-19）
 * body: { body }            返信を書き込む。クライアントへメールが飛ぶ
 * body: { status }          スレッドの状態だけ変える（対応済みにする等）
 * body: { menu_id }         メニューを提案する（§16-27-3）。カードとしてスレッドに入る
 * body: { report_reason }   通報する（§16-27-4）。プロ側からも通報できる（お互い様の建て付け）
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
        // status に CHECK 制約が残っていて 'archived' を弾かれた場合もここに来る
        // （migration 050 の確認手順を参照）。何が起きたか分かるようにコードを返す。
        console.error('[api/pro/consultations POST] status error:', error.message)
        return NextResponse.json({ error: 'update_failed', status_value: payload.status }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    // ── 通報（§16-27-4）──
    // CEO指摘(2026-08-06)「通報はプロもお互いに必要だよね？」。
    // 理由は必須（10文字以上）。ワンタップで送れると軽い通報が増え、運営が読む価値がなくなる。
    if (typeof payload.report_reason === 'string') {
      const reason = payload.report_reason.trim().slice(0, 500)
      if (reason.length < 10) {
        return NextResponse.json({ error: 'reason_required' }, { status: 400 })
      }
      const { error } = await supabase.from('consultation_reports').insert({
        consultation_id: consultation.id,
        reporter: 'pro',
        reason,
      })
      if (error) {
        // migration 052 未実行だとここに来る。届いていないのに成功と出さない。
        console.error('[api/pro/consultations POST] report error:', error.message)
        return NextResponse.json({ error: 'report_failed' }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    // ── メニューの提案（§16-27-3 相談→予約の接続）──
    // 相談で温まった人を、その場で予約に接続する。本文も必ず入れる
    // （menu_id カラムが無い環境や、後からメニューが消えた場合でも会話が成立するように）。
    if (typeof payload.menu_id === 'string' && payload.menu_id) {
      const { data: menu } = await supabase
        .from('pro_menus')
        .select('id, name, price_text, professional_id, is_active')
        .eq('id', payload.menu_id)
        .maybeSingle()

      // 他人のメニューを提案できないようにする
      if (!menu || menu.professional_id !== ownPro.id || menu.is_active === false) {
        return NextResponse.json({ error: 'menu_not_found' }, { status: 404 })
      }

      const text = `「${menu.name}」をご提案します（${menu.price_text}）`
      const row: Record<string, unknown> = {
        consultation_id: consultation.id,
        sender: 'pro',
        body: text,
        menu_id: menu.id,
      }

      let insertedId: string | null = null
      {
        const res = await supabase.from('consultation_messages').insert(row).select('id').maybeSingle()
        if (res.error) {
          // fail-soft: menu_id 未作成の環境ではキーを外して普通のメッセージとして入れる
          const { menu_id: _omit, ...withoutMenu } = row
          const retry = await supabase.from('consultation_messages').insert(withoutMenu).select('id').maybeSingle()
          if (retry.error || !retry.data) {
            console.error('[api/pro/consultations POST] menu insert error:', retry.error?.message)
            return NextResponse.json({ error: 'send_failed' }, { status: 500 })
          }
          insertedId = retry.data.id
        } else {
          insertedId = res.data?.id ?? null
        }
      }

      await supabase
        .from('consultations')
        .update({ status: 'open', updated_at: new Date().toISOString() })
        .eq('id', consultation.id)

      let delivered = false
      try {
        delivered = await notifyClientProReplied({
          clientEmail: consultation.client_email,
          clientName: consultation.client_name || '',
          proName: ownPro.name || '',
          body: text,
          token: consultation.access_token,
        })
      } catch (err) {
        console.error('[api/pro/consultations POST] menu notify error:', err)
      }
      if (delivered && insertedId) {
        await supabase
          .from('consultation_messages')
          .update({ delivered_at: new Date().toISOString() })
          .eq('id', insertedId)
      }

      return NextResponse.json({ ok: true, delivered })
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
