import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import { normalizeEmail } from '@/lib/normalize-email'

export const dynamic = 'force-dynamic'

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
      return NextResponse.json({ error: 'bad_signature' }, { status: 401 })
    }

    const payload = JSON.parse(raw) as { type?: string; data?: { to?: string[] | string } }
    // 届かなかったこと（bounced）だけを扱う。delivered/opened 等は無視する。
    if (payload.type !== 'email.bounced') {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const rawTo = payload.data?.to
    const addresses = (Array.isArray(rawTo) ? rawTo : rawTo ? [rawTo] : [])
      .map((a) => normalizeEmail(a))
      .filter(Boolean)
    if (addresses.length === 0) {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const supabase = getSupabaseAdmin()

    // そのアドレス宛の「進行中の予約」に印を立てる。過去の完了済みには触らない
    // （今から連絡が要るものだけを対象にする）。
    const { data: rows } = await supabase
      .from('referral_bookings')
      .select('id, preferred_slots')
      .in('client_email', addresses)
      .in('status', ['requested', 'confirmed'])
      .order('created_at', { ascending: false })
      .limit(20)

    for (const row of (rows || []) as Array<{ id: string; preferred_slots: Record<string, unknown> | null }>) {
      const next = { ...(row.preferred_slots || {}), receipt_email_failed: true }
      const { error } = await supabase
        .from('referral_bookings')
        .update({ preferred_slots: next })
        .eq('id', row.id)
      if (error) {
        console.error('[api/webhooks/resend] mark error:', row.id, error.message)
      }
    }

    console.log(`[api/webhooks/resend] bounced: marked ${rows?.length || 0} booking(s)`)
    return NextResponse.json({ ok: true, marked: rows?.length || 0 })
  } catch (err) {
    console.error('[api/webhooks/resend] error:', err)
    // 500 を返すと Resend が再送し続けるので、こちらの不具合は 200 で飲む（ログで追う）
    return NextResponse.json({ ok: true, error: 'internal' })
  }
}
