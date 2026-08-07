import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import { normalizeEmail } from '@/lib/normalize-email'
import { notifyBookingEmailFailedToSender } from '@/lib/referral-notify'
// §17-19: 未設定の間は sendSms が何もしない（既存の挙動は変わらない）
import { sendSms } from '@/lib/sms'

export const dynamic = 'force-dynamic'

// 外部に配るURLは origin ではなくハードコード（preview デプロイのURLが顧客に届くのを防ぐ）
const APP_URL = 'https://realproof.jp'

/**
 * POST /api/webhooks/resend — メールが「送れたのに届かなかった」ことを受け取る
 * （§17-3の穴埋め・CEO報告 2026-08-06）
 *
 * CEO報告:
 *   「予約フォームで間違ったメールを登録してみたけど、プロ側には電話して下さいが表示されない。」
 *
 * なぜ出なかったか（設計上の穴・§17-3で「対象外」と書いていたもの）:
 *   打ち間違いでも **形式が正しく、ドメインが実在する**（gmail.com など）と、
 *   Resend は受理して 200 を返す。送信時点では成功。宛先不明が分かるのは
 *   数秒〜数分後に届く **バウンス通知** で、これは非同期に webhook で来る。
 *   つまり「送信APIの戻り値」だけを見ている限り、この層は絶対に検知できない。
 *
 * ここで受け取って、そのアドレス宛の予約に「届いていない」印を立てる。
 * プロのカードに「お客さんに受付メールが届いていません。お電話でご連絡をお願いします」が出る。
 *
 * ★ 有効化には Resend 側の設定が要る（CEO作業）:
 *   1. Resend ダッシュボード ＞ Webhooks ＞ Add Endpoint
 *      URL: https://realproof.jp/api/webhooks/resend
 *      イベント: email.bounced（email.complained も入れてよい）
 *   2. 表示された Signing Secret（whsec_... ）を Vercel の環境変数
 *      RESEND_WEBHOOK_SECRET に設定
 *   未設定の間はこのエンドポイントは**何もしない**（署名を検証できないものは受け付けない）。
 */

/** Resend の webhook は Svix 形式の署名。`v1,<base64>` が空白区切りで複数入りうる。 */
function verifySvixSignature(params: {
  secret: string
  id: string
  timestamp: string
  signatureHeader: string
  body: string
}): boolean {
  const { secret, id, timestamp, signatureHeader, body } = params
  // whsec_ 以降が base64 の共有鍵
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')

  for (const part of signatureHeader.split(' ')) {
    const value = part.includes(',') ? part.split(',')[1] : part
    if (!value) continue
    const a = Buffer.from(value)
    const b = Buffer.from(expected)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true
  }
  return false
}

/**
 * GET /api/webhooks/resend — 動作確認用（秘密情報は出さない）
 *
 * CEO報告(2026-08-06)「webhookもsecretも設定したのに表示されない」の切り分け用。
 * ブラウザでこのURLを開くと、いま動いているビルドが
 *   ①このルートを持っているか ②RESEND_WEBHOOK_SECRET を読めているか
 * が1画面で分かる。値そのものは返さない（先頭数文字も出さない）。
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: 'resend-webhook',
    secret_configured: !!process.env.RESEND_WEBHOOK_SECRET,
  })
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.RESEND_WEBHOOK_SECRET
    if (!secret) {
      // 未設定 = この機能はまだ有効になっていない。200 で静かに終える
      // （Resend 側に再送を繰り返させない。ログにだけ残す）。
      console.warn('[api/webhooks/resend] RESEND_WEBHOOK_SECRET is not set — ignoring event')
      return NextResponse.json({ ok: true, ignored: true })
    }

    const raw = await request.text()
    const id = request.headers.get('svix-id') || ''
    const timestamp = request.headers.get('svix-timestamp') || ''
    const signature = request.headers.get('svix-signature') || ''
    if (!id || !timestamp || !signature) {
      return NextResponse.json({ error: 'missing_signature' }, { status: 400 })
    }
    // 再送攻撃対策: 5分より古いものは受けない
    const ageSec = Math.abs(Date.now() / 1000 - Number(timestamp))
    if (!Number.isFinite(ageSec) || ageSec > 300) {
      return NextResponse.json({ error: 'stale' }, { status: 400 })
    }
    if (!verifySvixSignature({ secret, id, timestamp, signatureHeader: signature, body: raw })) {
      // 401 は Resend 側の配信ログに残る。原因の当たりを付けられるよう、
      // 秘密そのものは出さずに形だけログする（whsec_ 付け忘れ・別プロジェクトの鍵など）。
      console.error(
        '[api/webhooks/resend] signature mismatch',
        `secret_len=${secret.length}`,
        `has_prefix=${secret.startsWith('whsec_')}`,
        `sig_parts=${signature.split(' ').length}`,
      )
      return NextResponse.json({ error: 'bad_signature' }, { status: 401 })
    }

    const payload = JSON.parse(raw) as { type?: string; data?: { to?: string[] | string } }
    // 届かなかったこと（bounced）だけを扱う。delivered/opened 等は無視する。
    if (payload.type !== 'email.bounced') {
      console.log('[api/webhooks/resend] ignored event:', payload.type)
      return NextResponse.json({ ok: true, ignored: true, type: payload.type || null })
    }

    const rawTo = payload.data?.to
    // §17-20(2026-08-06・本番不具合): 照合は**生アドレスと正規化後の両方**で行う。
    //   referral_bookings.client_email は入力されたままの生アドレスを保存している。
    //   ここで normalizeEmail() だけに畳んで .in() で突き合わせていたため、
    //   `foo+test@example.com` にバウンスが来ても `foo@example.com` を探しに行き、
    //   **予約に「届いていない」印が立たなかった**（プロ側に何も出なかった）。
    //   相談側は逆に正規化後の値を保存していた行が残っているので、両方入れて拾う。
    const toList = (Array.isArray(rawTo) ? rawTo : rawTo ? [rawTo] : [])
      .map((a) => (typeof a === 'string' ? a.trim().toLowerCase() : ''))
      .filter(Boolean)
    const addresses = Array.from(
      new Set([...toList, ...toList.map((a) => normalizeEmail(a))].filter(Boolean)),
    )
    if (addresses.length === 0) {
      console.error('[api/webhooks/resend] bounced but no recipient in payload')
      return NextResponse.json({ ok: true, ignored: true, reason: 'no_recipient' })
    }

    const supabase = getSupabaseAdmin()

    // そのアドレス宛の「進行中の予約」に印を立てる。過去の完了済みには触らない
    // （今から連絡が要るものだけを対象にする）。
    const { data: rows } = await supabase
      .from('referral_bookings')
      .select('id, sender_pro_id, receiver_pro_id, client_phone, preferred_slots, clients(nickname)')
      .in('client_email', addresses)
      .in('status', ['requested', 'confirmed'])
      .order('created_at', { ascending: false })
      .limit(20)

    type MarkRow = {
      id: string
      sender_pro_id: string | null
      receiver_pro_id: string | null
      client_phone: string | null
      preferred_slots: Record<string, unknown> | null
      clients: { nickname: string | null } | null
    }
    // §17-16: 新しく印が立った予約だけを通知対象にする（bounceは同じ宛先で何度も来るので、
    // 毎回通知すると送り手のLINEが埋まる）。
    const newlyFailed: MarkRow[] = []

    for (const row of (rows || []) as unknown as MarkRow[]) {
      const alreadyFailed = !!row.preferred_slots?.receipt_email_failed
      const next = {
        ...(row.preferred_slots || {}),
        receipt_email_failed: true,
        // §17-16: 印が立った時刻。「まず送り手が直す・24時間で受け手に移る」の起点になる。
        receipt_email_failed_at: alreadyFailed
          ? (row.preferred_slots?.receipt_email_failed_at as string | undefined) || new Date().toISOString()
          : new Date().toISOString(),
      }
      const { error } = await supabase
        .from('referral_bookings')
        .update({ preferred_slots: next })
        .eq('id', row.id)
      if (error) {
        console.error('[api/webhooks/resend] mark error:', row.id, error.message)
        continue
      }
      if (!alreadyFailed) newlyFailed.push(row)
    }

    // §17-19(CEO指示 2026-08-06): 「これを登録したら、既存のプロに電話させる流れも削除したい」
    //
    // メールが死んでも、電話番号は予約フォームの必須項目なので必ず残っている。
    // まずSMSで本人に直接リンクを送る。**送れたらそこで終わり**で、
    // §17-16 の人力フロー（送り手が電話してアドレスを聞く）は一切出さない。
    // 人が電話するのは「SMSも届かなかった＝電話番号まで間違っている」ときだけになる。
    //
    // TWILIO_* が未設定の間は sendSms が必ず false を返すので、従来どおり人力フローに落ちる。
    const smsRecovered = new Set<string>()
    const markedAt = new Date().toISOString()
    for (const row of newlyFailed) {
      const result = await sendSms(
        row.client_phone,
        `【REAL PROOF】ご登録のメールアドレスにご案内が届きませんでした。` +
          `お手数ですが、こちらからご予約の状況をご確認ください。\n${APP_URL}/booking/${row.id}`,
      )
      if (!result.sent) continue
      smsRecovered.add(row.id)
      const { error } = await supabase
        .from('referral_bookings')
        .update({
          preferred_slots: {
            ...(row.preferred_slots || {}),
            receipt_email_failed: true,
            // 直前のループで書いた値を落とさない（row.preferred_slots は更新前のスナップショット）
            receipt_email_failed_at:
              (row.preferred_slots?.receipt_email_failed_at as string | undefined) || markedAt,
            // これが立っている間、プロ側にはメール未達の対応ブロックを出さない（§17-19）。
            contact_recovered_by_sms_at: markedAt,
          },
        })
        .eq('id', row.id)
      if (error) {
        // 印が書けなかった場合はプロ側の人力フローを残す（黙って誰も気づかない状態を作らない）
        console.error('[api/webhooks/resend] sms mark error:', row.id, error.message)
        smsRecovered.delete(row.id)
      }
    }

    // §17-16(CEO指示 2026-08-06): SMSで届かなかったときだけ、人が動く。
    // 直す仕事は**紹介元（送り手）**のもの。送り手はそのクライアントを自分で紹介した本人なので、
    // 電話するのに無理がない。受け手には出さない（会ったこともない他人へ電話させない）。
    // 直接予約(送り手なし)はこの通知の対象外＝従来どおり受け手が自分で直す。
    for (const row of newlyFailed) {
      if (smsRecovered.has(row.id)) continue
      if (!row.sender_pro_id) continue
      try {
        const [{ data: senderPro }, { data: receiverPro }] = await Promise.all([
          supabase
            .from('professionals')
            .select('name, contact_email, line_messaging_user_id')
            .eq('id', row.sender_pro_id)
            .maybeSingle(),
          row.receiver_pro_id
            ? supabase.from('professionals').select('name').eq('id', row.receiver_pro_id).maybeSingle()
            : Promise.resolve({ data: null } as { data: { name: string } | null }),
        ])
        if (!senderPro) continue
        await notifyBookingEmailFailedToSender(
          {
            name: (senderPro as any).name,
            contact_email: (senderPro as any).contact_email,
            line_messaging_user_id: (senderPro as any).line_messaging_user_id,
          },
          row.clients?.nickname || 'クライアント',
          (receiverPro as any)?.name || null,
        )
      } catch (notifyErr) {
        // 通知の失敗で webhook を落とさない（落とすと Resend が再送し続ける）
        console.error('[api/webhooks/resend] sender notify error (fail-soft):', row.id, notifyErr)
      }
    }

    // §17-8: 相談チャットにも同じ印を立てる。
    // 相談は**メールしか預かっていない**ので、届かない＝クライアントが戻る手段が一切ない。
    // 予約より重い（予約には電話番号がある）。migration 058 未実行なら黙って何もしない。
    let markedConsultations = 0
    try {
      const { data: consultations, error: consultError } = await supabase
        .from('consultations')
        .update({ email_failed_at: new Date().toISOString() })
        .in('client_email', addresses)
        .neq('status', 'closed')
        .select('id')
      if (consultError) {
        console.error('[api/webhooks/resend] consultation mark error (fail-soft):', consultError.message)
      } else {
        markedConsultations = consultations?.length || 0
      }
    } catch (consultErr) {
      console.error('[api/webhooks/resend] consultation mark error (fail-soft):', consultErr)
    }

    console.log(
      `[api/webhooks/resend] bounced: marked ${rows?.length || 0} booking(s), ${markedConsultations} consultation(s)`,
    )
    return NextResponse.json({ ok: true, marked: rows?.length || 0, marked_consultations: markedConsultations })
  } catch (err) {
    console.error('[api/webhooks/resend] error:', err)
    // 500 を返すと Resend が再送し続けるので、こちらの不具合は 200 で飲む（ログで追う）
    return NextResponse.json({ ok: true, error: 'internal' })
  }
}
