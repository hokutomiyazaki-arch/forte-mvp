import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { email, proName, token } = await req.json()

    if (!email || !proName || !token) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://forte-mvp.vercel.app'
    const confirmUrl = `${appUrl}/api/confirm-vote?token=${token}`

    // Resend でメール送信
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'REAL PROOF <info@proof-app.jp>',
          to: email,
          subject: 'プルーフの確認をお願いします',
          html: `
            <div style="max-width:480px;margin:0 auto;font-family:sans-serif;">
              <div style="background:#1A1A2E;padding:24px;border-radius:12px 12px 0 0;">
                <h1 style="color:#C4A35A;font-size:14px;margin:0;">REAL PROOF</h1>
              </div>
              <div style="padding:24px;background:#fff;border:1px solid #eee;">
                <p style="color:#333;font-size:16px;font-weight:bold;">プルーフの確認</p>
                <p style="color:#333;">
                  ${proName}さんへのプルーフを送信するには、以下のボタンをクリックしてください。
                </p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${confirmUrl}"
                     style="background:#1A1A2E;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold;">
                    ✉️ プルーフを確認する
                  </a>
                </div>
                <p style="color:#999;font-size:12px;">
                  このリンクは24時間有効です。<br>
                  心当たりがない場合は、このメールを無視してください。
                </p>
              </div>
              <div style="padding:16px;text-align:center;background:#f9f9f9;border-radius:0 0 12px 12px;">
                <p style="color:#999;font-size:11px;margin:0;">REAL PROOF — 強みで証明されたプロに出会う</p>
              </div>
            </div>
          `,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        console.error('Resend error:', errData)
        return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
      }
    } else {
      // Resend未設定時はログ出力
      console.log('=== CONFIRMATION EMAIL ===')
      console.log(`To: ${email}`)
      console.log(`Pro: ${proName}`)
      console.log(`Confirm URL: ${confirmUrl}`)
      console.log('==========================')
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Send confirmation error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
