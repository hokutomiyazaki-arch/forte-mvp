import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { normalizeEmail } from '@/lib/normalize-email'
import { notifyClientConsultationReceived, notifyProNewConsultation } from '@/lib/consultation-notify'
import {
  screenSubmission,
  MAX_PER_EMAIL_PER_HOUR,
  MAX_PER_PRO_PER_HOUR,
} from '@/lib/consultation-guard'

export const dynamic = 'force-dynamic'

const NAME_MAX = 50
const BODY_MAX = 2000
const EMAIL_MAX = 254

/** 同一メール×同一プロの連投を止める窓（分）。フォーム二度押し・いたずら対策。 */
const COOLDOWN_MINUTES = 5
/** 1スレッドあたりのメッセージ上限（既存の /api/consultations/[token] と揃える）。 */
const MESSAGE_LIMIT = 100

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

    // CEO指示(2026-08-06): 受信許可のオプトイン。UIで必須にしているが、
    // API直叩きを塞ぐためサーバー側でも必須にする。
    if (body.consent !== true) {
      return NextResponse.json({ error: 'consent_required' }, { status: 400 })
    }

    // ボット対策の第1層（DBを見ない範囲）
    const verdict = screenSubmission({
      honeypot: body.company,
      renderedAt: body.rendered_at,
      body: messageBody,
    })
    if (!verdict.ok) {
      // ボット確定の場合は成功したように見せて捨てる（検知を悟らせない）
      if (verdict.silent) return NextResponse.json({ ok: true, token: '' })
      return NextResponse.json({ error: verdict.error }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // 相手プロの実在確認。退会済み(deactivated_at)は受け付けない。
    const { data: pro } = await supabase
      .from('professionals')
      .select('id, name, contact_email, line_messaging_user_id, accepting_status, consultation_enabled')
      .eq('id', proId)
      .is('deactivated_at', null)
      .maybeSingle()

    if (!pro) return NextResponse.json({ error: 'pro_not_found' }, { status: 404 })

    // 受付停止(closed)は相談も受けない。'conditional' は「紹介予約のみ停止・直接の相談は継続」
    // （§16-18）なので受け付ける。
    if (pro.accepting_status === 'closed') {
      return NextResponse.json({ error: 'not_accepting' }, { status: 409 })
    }

    // §16-25: 相談だけを止めるスイッチ。カラム未作成なら null が返るので
    // その場合は「受け付ける」として扱う（fail-soft）。
    if ((pro as any).consultation_enabled === false) {
      return NextResponse.json({ error: 'not_accepting' }, { status: 409 })
    }

    // 検索・重複チェックは normalized 側で行う（voter_email は表示用、の既存方針に合わせる）。
    // §17-20(CEO報告 2026-08-06・本番不具合): ただし **保存・送信は本人が入力したアドレス**。
    //   normalizeEmail() は Gmail のドットと、全ドメインの "+タグ" を落とす照合キーであって、
    //   宛先ではない。ここに正規化後の値を保存していたため、
    //   `foo+test@example.com` 宛の相談メールが `foo@example.com`（別のメールボックス）へ飛び、
    //   クライアントには永久に届かなかった。CLAUDE.md「検索・重複チェックは normalized_email、
    //   voter_email は表示用」の線を、このテーブルだけ踏み越えていた。
    const clientEmail = clientEmailRaw.toLowerCase()
    const normalized = normalizeEmail(clientEmailRaw)

    // 連投防止: 同じ人が同じプロへ短時間に複数スレッドを立てるのを止める。
    // 既存スレッドがある場合はそこへ追記してもらう導線（フロントで token を返す）。
    // §17-20: 保存値が生アドレスになったので、突き合わせは JS 側で正規化して行う
    //   （`+タグ` 違いを同一人物として扱う、という元の意図はそのまま維持する）。
    const since = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString()
    const { data: recentRows } = await supabase
      .from('consultations')
      .select('id, access_token, created_at, client_email')
      .eq('pro_id', proId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)
    const recent =
      ((recentRows || []) as Array<{ id: string; access_token: string; client_email: string | null }>).find(
        (r) => normalizeEmail(r.client_email) === normalized,
      ) || null

    // §17-21(CEO報告 2026-08-06・本番不具合)「他のプロに送った相談チャットが表示されない」:
    //   ここで 429 を返して既存スレッドへリダイレクトしていたため、
    //   **いま入力した本文がどこにも保存されずに消えていた**。
    //   お客さんから見れば「送信した」のに、飛ばされた先のスレッドには自分の文章が無い。
    //   §16-27 の連投制限の狙いは「スレッドを増やさない」ことであって、
    //   「本文を捨てる」ことではなかった。**既存スレッドに追記する**のが正しい。
    if (recent) {
      const { count: recentMsgCount } = await supabase
        .from('consultation_messages')
        .select('id', { count: 'exact', head: true })
        .eq('consultation_id', recent.id)
      if ((recentMsgCount || 0) >= MESSAGE_LIMIT) {
        return NextResponse.json({ error: 'limit_reached', token: recent.access_token }, { status: 409 })
      }

      const { error: appendError } = await supabase.from('consultation_messages').insert({
        consultation_id: recent.id,
        sender: 'client',
        body: messageBody,
      })
      if (appendError) {
        console.error('[api/consultations POST] append error:', appendError.message)
        return NextResponse.json({ error: 'create_failed' }, { status: 500 })
      }
      // プロ側の受信箱で未返信として立ち上げ直す（新規スレッドと同じ扱いにする）
      await supabase
        .from('consultations')
        .update({ status: 'new', updated_at: new Date().toISOString() })
        .eq('id', recent.id)

      try {
        await notifyProNewConsultation({
          proName: pro.name || '',
          contactEmail: pro.contact_email ?? null,
          lineUserId: (pro as any).line_messaging_user_id ?? null,
          clientName,
          body: messageBody,
        })
      } catch (err) {
        console.error('[api/consultations POST] pro notify error (append):', err)
      }

      return NextResponse.json({ ok: true, token: recent.access_token, appended: true })
    }

    // ボット対策の第2層（件数の上限）。
    // 第1層はクライアント申告に頼る部分があり偽装できるので、被害の量はここで抑える。
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    // ①同じメールアドレスがプロをまたいで乱射するのを止める
    //   （メール中継として悪用された場合、宛先は攻撃者が指定した第三者になる）
    // §17-20: 同上。直近1時間ぶんだけ引いて JS で正規化突き合わせする
    //   （件数が増えたら consultations に normalized_email 列を足してインデックスを張る）。
    const { data: hourRows } = await supabase
      .from('consultations')
      .select('client_email')
      .gte('created_at', hourAgo)
      .limit(1000)
    const emailCount = ((hourRows || []) as Array<{ client_email: string | null }>).filter(
      (r) => normalizeEmail(r.client_email) === normalized,
    ).length
    if ((emailCount || 0) >= MAX_PER_EMAIL_PER_HOUR) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    // ②特定のプロを狙い撃ちされた場合の被害を抑える
    const { count: proCount } = await supabase
      .from('consultations')
      .select('id', { count: 'exact', head: true })
      .eq('pro_id', proId)
      .gte('created_at', hourAgo)
    if ((proCount || 0) >= MAX_PER_PRO_PER_HOUR) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    // 推測不能なトークン。UUID2本分（メールのリンクが唯一の鍵になるため短くしない）。
    const accessToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')

    // INSERT は最終確認後に1回だけ（pending→後で更新パターンは作らない）
    const record: Record<string, unknown> = {
      pro_id: proId,
      client_name: clientName,
      // §17-20: 送信先になる値。正規化前の（本人が入力した）アドレスを保存する。
      client_email: clientEmail,
      access_token: accessToken,
      status: 'new',
      // オプトインの証跡（migration 050）。未実行環境では下で外して再試行する。
      consent_at: new Date().toISOString(),
    }

    let created: { id: string; access_token: string } | null = null
    let insertError: { message?: string } | null = null
    {
      const res = await supabase.from('consultations').insert(record).select('id, access_token').maybeSingle()
      created = res.data
      insertError = res.error
      if (insertError) {
        // fail-soft: consent_at 未作成の環境ではキーを外して再試行する
        // （gallery_image_urls 等と同じやり方。カラムが増える前でも相談は受けられるようにする）
        const { consent_at: _omit, ...withoutConsent } = record
        const retry = await supabase
          .from('consultations')
          .insert(withoutConsent)
          .select('id, access_token')
          .maybeSingle()
        created = retry.data
        insertError = retry.error
      }
    }

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
    // §17-3(CEO指摘 2026-08-06): メールアドレスの打ち間違い対策は相談フォームにも要る。
    // 受付メールを送れたかを返し、完了画面でその場で伝える
    // （黙って成功にすると、お客さんは「送れた」と思ったまま何も届かない）。
    let receiptSent = false
    try {
      receiptSent = await notifyClientConsultationReceived({
        clientEmail: clientEmailRaw,
        clientName,
        proName: pro.name || '',
        token: created.access_token,
      })
    } catch (err) {
      console.error('[api/consultations POST] client notify error:', err)
    }

    return NextResponse.json({ ok: true, token: created.access_token, receipt_sent: receiptSent })
  } catch (err) {
    console.error('[api/consultations POST] error:', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
