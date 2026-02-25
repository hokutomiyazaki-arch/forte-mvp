import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// MVP: クーポンメール送信API
// 本番ではResend/SendGrid等を使うが、MVPではSupabaseのメール機能 or console.logで代替
export async function POST(req: NextRequest) {
  try {
    const { email, proName, couponCode, couponText, proId } = await req.json()

    if (!email || !proName || !couponCode) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // MVP Phase: メール送信の実装
    // Option 1: Resend (推奨 - 無料枠で月100通)
    // Option 2: SendGrid
    // Option 3: Supabase Edge Function
    // 
    // 現時点ではログ出力のみ。メール配信サービスを接続したら下記を有効化。
    
    console.log('=== COUPON EMAIL ===')
    console.log(`To: ${email}`)
    console.log(`From: ${proName}`)
    console.log(`Code: ${couponCode}`)
    console.log(`Text: ${couponText}`)
    console.log(`Pro Card: /card/${proId}`)
    console.log('====================')

    // Resend を使う場合（RESEND_API_KEY を環境変数に設定）:
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
          subject: `${proName}さんからクーポンが届いています`,
          html: `
            <div style="max-width:480px;margin:0 auto;font-family:sans-serif;">
              <div style="background:#1A1A2E;padding:24px;border-radius:12px 12px 0 0;">
                <h1 style="color:#C4A35A;font-size:14px;margin:0;">REAL PROOF</h1>
              </div>
              <div style="padding:24px;background:#fff;border:1px solid #eee;">
                <p style="color:#333;">プルーフを贈ってくれてありがとうございます。</p>
                <p style="color:#333;">${proName}さんからクーポンが届いています。</p>
                
                <div style="background:#f8f6f0;border:2px dashed #C4A35A;border-radius:8px;padding:16px;text-align:center;margin:20px 0;">
                  <p style="color:#666;font-size:12px;margin:0 0 4px;">クーポン内容</p>
                  <p style="color:#1A1A2E;font-size:18px;font-weight:bold;margin:0;">${couponText}</p>
                </div>

                <p style="color:#666;font-size:13px;">クーポンを使用するには、以下からログインしてください。</p>
                
                <div style="text-align:center;margin:24px 0;">
                  <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://forte-mvp.vercel.app'}/mycard" 
                     style="background:#C4A35A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
                    ログインしてクーポンを受け取る
                  </a>
                </div>

                <p style="color:#999;font-size:11px;">※ クーポンは対面時にプロの前で「使用する」ボタンを押してご利用ください。</p>
              </div>
              <div style="padding:16px;text-align:center;background:#f9f9f9;border-radius:0 0 12px 12px;">
                <p style="color:#999;font-size:11px;margin:0;">
                  REAL PROOF — 強みで証明されたプロに出会う
                </p>
              </div>
            </div>
          `,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        console.error('Resend error:', errData)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Send coupon error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
