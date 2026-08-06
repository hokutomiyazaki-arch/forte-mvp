import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { normalizeEmail } from '@/lib/normalize-email'
import { notifyClientConsultationReceived, notifyProNewConsultation } from '@/lib/consultation-notify'

export const dynamic = 'force-dynamic'

const NAME_MAX = 50
const BODY_MAX = 2000
const EMAIL_MAX = 254

/** 同一メール×同一プロの連投を止める窓（分）。フォーム二度押し・いたずら対策。 */
const COOLDOWN_MINUTES = 5

/**
 * POST /api/consultations  （§16-19・認証不要の公開エンドポイント）
 * body: { pro_id, client_name, client_email, body }
 *
 * カードの「相談する」から呼ばれる。mailto の置き換えなので**ログイン不要**。
 * 日時の入力は無い（日時を選ぶのは「予約する」側・§16-13）。
 *
 * レスポンスには client_email を含めない（PII。プロのダッシュボードでのみ表示する）。
 * 返すのは access_token だけ。これがクライアントがやりとりに戻る唯一の鍵になる。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

    const proId = typeof body.pro_id === 'string' ? body.pro_id.trim() : ''
    const clientName = typeof body.client_name === 'string' ? body.client_name.trim() : ''
    const clientEmailRaw = typeof body.client_email === 'string' ? body.client_email.trim() : ''
    const messageBody = typeof body.body === 'string' ? body.body.trim() : ''

    if (!proId) return NextResponse.json({ error: 'pro_required' }, { status: 400 })
    if (!clientName || clientName.length > NAME_MAX) {
      return NextResponse.json({ error: 'name_invalid' }, { status: 400 })
    }
    if (!clientEmailRaw || clientEmailRaw.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmailRaw)) {
      return NextResponse.json({ error: 'email_invalid' }, { status: 400 })
    }
    if (!messageBody || messageBody.length > BODY_MAX) {
      return NextResponse.json({ error: 'body_invalid' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // 相手プロの実在確認。退会済み(deactivated_at)は受け付けない。
    const { data: pro } = await supabase
      .from('professionals')
      .select('id, name, contact_email, line_messaging_user_id, accepting_status')
      .eq('id', proId)
      .is('deactivated_at', null)
      .maybeSingle()

    if (!pro) return NextResponse.json({ error: 'pro_not_found' }, { status: 404 })

    // 受付停止(closed)は相談も受けない。'conditional' は「紹介予約のみ停止・直接の相談は継続」
    // （§16-18）なので受け付ける。
    if (pro.accepting_status === 'closed') {
      return NextResponse.json({ error: 'not_accepting' }, { status: 409 })
    }

    // 検索・重複チェックは normalized_email 側で行う（voter_email は表示用、の既存方針に合わせる）
    const normalized = normalizeEmail(clientEmailRaw)

    // 連投防止: 同じ人が同じプロへ短時間に複数スレッドを立てるのを止める。
    // 既存スレッドがある場合はそこへ追記してもらう導線（フロントで token を返す）。
    const since = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString()
    const { data: recent } = await supabase
      .from('consultations')
      .select('id, access_token, created_at')
      .eq('pro_id', proId)
      .eq('client_email', normalized)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recent) {
      return NextResponse.json(
        { error: 'too_soon', token: recent.access_token },
        { status: 429 },
      )
    }

    // 推測不能なトークン。UUID2本分（メールのリンクが唯一の鍵になるため短くしない）。
    const accessToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')

    // INSERT は最終確認後に1回だけ（pending→後で更新パターンは作らない）
    const { data: created, error: insertError } = await supabase
      .from('consultations')
      .insert({
        pro_id: proId,
        client_name: clientName,
        client_email: normalized,
        access_token: accessToken,
        status: 'new',
      })
      .select('id, access_token')
      .maybeSingle()

    if (insertError || !created) {
      console.error('[api/consultations POST] insert error:', insertError?.message)
      return NextResponse.json({ error: 'create_failed' }, { status: 500 })
    }

    const { error: msgError } = await supabase.from('consultation_messages').insert({
      consultation_id: created.id,
      sender: 'client',
      body: messageBody,
    })
    if (msgError) {
      console.error('[api/consultations POST] message insert error:', msgError.message)
      return NextResponse.json({ error: 'create_failed' }, { status: 500 })
    }

    // 通知の失敗は相談の保存を巻き戻さない（本文はもう入っている）
    try {
      await notifyProNewConsultation({
        proName: pro.name || '',
        contactEmail: pro.contact_email ?? null,
        lineUserId: (pro as any).line_messaging_user_id ?? null,
        clientName,
        body: messageBody,
      })
    } catch (err) {
      console.error('[api/consultations POST] pro notify error:', err)
    }
    try {
      await notifyClientConsultationReceived({
        clientEmail: clientEmailRaw,
        clientName,
        proName: pro.name || '',
        token: created.access_token,
      })
    } catch (err) {
      console.error('[api/consultations POST] client notify error:', err)
    }

    return NextResponse.json({ ok: true, token: created.access_token })
  } catch (err) {
    console.error('[api/consultations POST] error:', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
