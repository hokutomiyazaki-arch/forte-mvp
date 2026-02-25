import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const { professional_id } = await req.json()

    if (!professional_id) {
      return NextResponse.json({ error: 'Missing professional_id' }, { status: 400 })
    }

    // プロ情報取得
    const { data: pro } = await supabaseAdmin
      .from('professionals')
      .select('display_name, name, contact_email, user_id, last_nfc_notify_at')
      .eq('id', professional_id)
      .maybeSingle()

    if (!pro) {
      return NextResponse.json({ error: 'Professional not found' }, { status: 404 })
    }

    // 24時間以内に通知済みかチェック
    const lastNotify = pro.last_nfc_notify_at ? new Date(pro.last_nfc_notify_at) : null
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    if (lastNotify && lastNotify >= twentyFourHoursAgo) {
      return NextResponse.json({ skipped: true, reason: 'already_notified_within_24h' })
    }

    // プロのメールアドレスを取得
    let proEmail = pro.contact_email
    if (!proEmail && pro.user_id) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(pro.user_id)
      proEmail = userData?.user?.email || null
    }

    if (!proEmail) {
      return NextResponse.json({ skipped: true, reason: 'no_email' })
    }

    // メール送信
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://realproof.jp'
    const resendKey = process.env.RESEND_API_KEY
    const displayName = pro.display_name || pro.name || 'プロ'

    if (resendKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'REAL PROOF <info@proof-app.jp>',
          to: proEmail,
          subject: 'あなたのREALPROOFカードが読み取られました',
          html: `
            <div style="max-width:480px;margin:0 auto;font-family:sans-serif;">
              <div style="background:#1A1A2E;padding:24px;border-radius:12px 12px 0 0;">
                <h1 style="color:#C4A35A;font-size:14px;margin:0;">REAL PROOF</h1>
              </div>
              <div style="padding:24px;background:#fff;border:1px solid #eee;">
                <p style="color:#333;font-size:16px;font-weight:bold;">${displayName} さん</p>
                <p style="color:#333;line-height:1.8;">
                  あなたのREALPROOFカードが読み取られました！<br>
                  クライアントが投票しようとしましたが、強み項目の設定がまだ完了していないため、投票できませんでした。
                </p>
                <p style="color:#333;line-height:1.8;">
                  今すぐ設定を完了して、クライアントからの投票を受け付けましょう。
                </p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${appUrl}/dashboard"
                     style="background:#1A1A2E;color:#C4A35A;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold;">
                    ダッシュボードで設定を完了する
                  </a>
                </div>
              </div>
              <div style="padding:16px;text-align:center;background:#f9f9f9;border-radius:0 0 12px 12px;">
                <p style="color:#999;font-size:11px;margin:0;">REAL PROOF — 強みが、あなたを定義する。</p>
              </div>
            </div>
          `,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        console.error('NFC notify Resend error:', errData)
        return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
      }
    } else {
      // Resend未設定時はログ出力
      console.log('=== NFC NOTIFY EMAIL ===')
      console.log(`To: ${proEmail}`)
      console.log(`Pro: ${displayName}`)
      console.log(`Dashboard: ${appUrl}/dashboard`)
      console.log('========================')
    }

    // last_nfc_notify_at を更新
    await supabaseAdmin
      .from('professionals')
      .update({ last_nfc_notify_at: new Date().toISOString() })
      .eq('id', professional_id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('NFC notify error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
