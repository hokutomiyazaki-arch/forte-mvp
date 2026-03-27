import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { email, professional_id } = await req.json()

    if (!email || !professional_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // 6桁の確認コードを生成
    const code = Math.floor(100000 + Math.random() * 900000).toString()

    // 有効期限: 10分
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    // 既存のpending確認コードを無効化
    await supabase
      .from('vote_confirmations')
      .update({ confirmed_at: new Date().toISOString() })
      .eq('email', email)
      .eq('professional_id', professional_id)
      .is('confirmed_at', null)

    // 新しい確認コードを保存
    const { data: confirmation, error: insertError } = await supabase
      .from('vote_confirmations')
      .insert({
        email: email,
        professional_id: professional_id,
        token: code,  // 既存のtokenカラムを確認コードとして再利用
        expires_at: expiresAt,
      })
      .select('id')
      .maybeSingle()

    if (insertError) {
      console.error('[send-code] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create confirmation' }, { status: 500 })
    }

    // プロの名前を取得
    const { data: pro } = await supabase
      .from('professionals')
      .select('name')
      .eq('id', professional_id)
      .maybeSingle()

    const proName = pro?.name || 'プロ'

    // Resend でコードメール送信
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'REALPROOF <info@proof-app.jp>',
          to: email,
          subject: `確認コード: ${code} — REALPROOF`,
          html: `
            <div style="max-width:480px;margin:0 auto;font-family:sans-serif;">
              <div style="background:#1A1A2E;padding:24px;border-radius:12px 12px 0 0;">
                <h1 style="color:#C4A35A;font-size:14px;margin:0;">REALPROOF</h1>
              </div>
              <div style="padding:24px;background:#fff;border:1px solid #eee;">
                <p style="color:#333;font-size:16px;font-weight:bold;">確認コード</p>
                <p style="color:#333;">
                  ${proName}さんへの投票を完了するために、以下のコードを入力してください。
                </p>
                <div style="text-align:center;margin:24px 0;">
                  <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1A1A2E;background:#f5f5f0;padding:12px 24px;border-radius:8px;display:inline-block;">
                    ${code}
                  </span>
                </div>
                <p style="color:#999;font-size:12px;">
                  このコードは10分間有効です。<br>
                  心当たりがない場合は、このメールを無視してください。
                </p>
              </div>
              <div style="padding:16px;text-align:center;background:#f9f9f9;border-radius:0 0 12px 12px;">
                <p style="color:#999;font-size:11px;margin:0;">REALPROOF — 強みで証明されたプロに出会う</p>
              </div>
            </div>
          `,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        console.error('[send-code] Resend error:', errData)
        return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
      }
    }

    console.log('[send-code] Code sent to:', email, 'for pro:', professional_id)
    return NextResponse.json({ success: true, confirmation_id: confirmation?.id })
  } catch (err) {
    console.error('[send-code] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
