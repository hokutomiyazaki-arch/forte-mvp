import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { email, isGoogle } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 })
    }

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      console.log('[welcome-email] No RESEND_API_KEY, skipping')
      return NextResponse.json({ success: true })
    }

    const isGmail = email.toLowerCase().endsWith('@gmail.com')

    let bodyHtml: string
    if (isGoogle) {
      bodyHtml = `
        <p style="color:#333;font-size:15px;">REAL PROOFへようこそ！</p>
        <p style="color:#333;font-size:14px;">次回からGoogleアカウントでログインできます。</p>
      `
    } else {
      bodyHtml = `
        <p style="color:#333;font-size:15px;">REAL PROOFへようこそ！</p>
        <p style="color:#333;font-size:14px;">登録したメールアドレスとパスワードでログインできます。</p>
        ${isGmail ? '<p style="color:#C4A35A;font-size:14px;font-weight:bold;">Googleアカウントでもログインできます！</p>' : ''}
      `
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://forte-mvp.vercel.app'

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'REAL PROOF <info@proof-app.jp>',
        to: email,
        subject: 'REAL PROOFへようこそ！',
        html: `
          <div style="max-width:480px;margin:0 auto;font-family:sans-serif;">
            <div style="background:#1A1A2E;padding:24px;border-radius:12px 12px 0 0;">
              <h1 style="color:#C4A35A;font-size:14px;margin:0;">REAL PROOF</h1>
            </div>
            <div style="padding:24px;background:#fff;border:1px solid #eee;">
              ${bodyHtml}
              <div style="text-align:center;margin:24px 0;">
                <a href="${appUrl}/sign-in"
                   style="display:inline-block;background:#1A1A2E;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:14px;">
                  ログインする
                </a>
              </div>
            </div>
            <div style="padding:16px;text-align:center;background:#f9f9f9;border-radius:0 0 12px 12px;">
              <p style="color:#999;font-size:11px;margin:0;">REAL PROOF — 強みで証明されたプロに出会う</p>
            </div>
          </div>
        `,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('[welcome-email] Send failed:', res.status, errBody)
    } else {
      console.log('[welcome-email] Sent to:', email)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[welcome-email] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
