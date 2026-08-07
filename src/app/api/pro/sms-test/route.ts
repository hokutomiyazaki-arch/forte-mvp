import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { isSmsEnabled, sendSms, toE164Jp } from '@/lib/sms'

export const dynamic = 'force-dynamic'

/**
 * §17-19: Twilio の設定確認用（CEO作業の切り分け）。
 *
 * Resend webhook の GET と同じ狙い。環境変数を入れて再デプロイしたあと、
 * 「本当に今のビルドが読めているか」を**実際に送らずに**確かめられるようにする。
 * 値そのものは返さない（先頭数文字も出さない）。
 *
 * ★ 送信先は**ログイン中のプロ本人が登録した電話番号**に固定する。
 *   宛先を body で受け取ると、ログインさえすれば任意の番号へ我々のコストでSMSを
 *   送れてしまう（迷惑行為・課金の踏み台になる）。テストのために穴を開けない。
 */

export async function GET() {
  const from = process.env.TWILIO_SMS_FROM || ''
  return NextResponse.json({
    ok: true,
    route: 'sms-test',
    enabled: isSmsEnabled(),
    account_sid_configured: !!process.env.TWILIO_ACCOUNT_SID,
    auth_token_configured: !!process.env.TWILIO_AUTH_TOKEN,
    // 番号は秘密ではないが、念のため形だけ返す（+81/+1 のどちらを入れたかの確認用）
    from_configured: !!from,
    from_looks_like_number: /^\+\d{8,15}$/.test(from),
  })
}

/**
 * POST /api/pro/sms-test
 * 自分のプロフィールに登録済みの電話番号へ、テストSMSを1通送る。
 */
export async function POST() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!isSmsEnabled()) {
      return NextResponse.json({ error: 'sms_not_configured' }, { status: 503 })
    }

    const supabase = getSupabaseAdmin()
    const { data: pro } = await supabase
      .from('professionals')
      .select('id, phone_number, deactivated_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (!pro || pro.deactivated_at) {
      return NextResponse.json({ error: 'no_professional_profile' }, { status: 403 })
    }
    const phone = (pro as any).phone_number as string | null
    if (!phone) {
      return NextResponse.json({ error: 'no_phone_on_profile' }, { status: 400 })
    }
    if (!toE164Jp(phone)) {
      // 固定電話・桁数違いなど。ここで気づけないと「送ったのに来ない」で悩むことになる。
      return NextResponse.json({ error: 'phone_not_mobile' }, { status: 400 })
    }

    const result = await sendSms(phone, '【REAL PROOF】SMSの設定確認です。この文面が届いていれば設定は完了しています。')
    if (!result.sent) {
      return NextResponse.json({ error: 'send_failed', reason: result.reason || null }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/pro/sms-test] error:', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
