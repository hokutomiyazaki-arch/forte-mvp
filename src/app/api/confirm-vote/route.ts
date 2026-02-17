import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/vote-error?reason=missing-token', req.url))
  }

  // トークンで確認レコードを取得
  const { data: confirmation, error } = await supabaseAdmin
    .from('vote_confirmations')
    .select('*')
    .eq('token', token)
    .is('confirmed_at', null)
    .single()

  if (error || !confirmation) {
    return NextResponse.redirect(new URL('/vote-error?reason=invalid-token', req.url))
  }

  // 期限切れチェック
  if (new Date(confirmation.expires_at) < new Date()) {
    return NextResponse.redirect(new URL('/vote-error?reason=expired', req.url))
  }

  // 確認処理: confirmationを更新
  await supabaseAdmin
    .from('vote_confirmations')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('id', confirmation.id)

  // 投票ステータスをconfirmedに更新
  await supabaseAdmin
    .from('votes')
    .update({ status: 'confirmed' })
    .eq('id', confirmation.vote_id)

  // 投票データを別途取得
  const { data: vote } = await supabaseAdmin
    .from('votes')
    .select('*')
    .eq('id', confirmation.vote_id)
    .single()

  const professionalId = vote?.professional_id

  // プロがクーポン設定済みならクーポン発行
  if (professionalId) {
    const { data: pro } = await supabaseAdmin
      .from('professionals')
      .select('id, user_id, name, coupon_text')
      .eq('id', professionalId)
      .single()

    if (pro?.coupon_text && vote?.voter_email) {
      const couponCode = Math.random().toString(36).substring(2, 10).toUpperCase()
      await supabaseAdmin.from('coupons').insert({
        pro_user_id: pro.user_id,
        client_email: vote.voter_email,
        discount_type: 'percentage',
        discount_value: 10,
        code: couponCode,
        status: 'active',
      })

      // クーポンメール送信
      const resendKey = process.env.RESEND_API_KEY
      if (resendKey) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'REAL PROOF <info@proof-app.jp>',
              to: vote.voter_email,
              subject: `${pro.name}さんからクーポンが届いています`,
              html: `
                <div style="max-width:480px;margin:0 auto;font-family:sans-serif;">
                  <div style="background:#1A1A2E;padding:24px;border-radius:12px 12px 0 0;">
                    <h1 style="color:#C4A35A;font-size:14px;margin:0;">REAL PROOF</h1>
                  </div>
                  <div style="padding:24px;background:#fff;border:1px solid #eee;">
                    <p style="color:#333;">プルーフの確認ありがとうございます！</p>
                    <p style="color:#333;">${pro.name}さんからクーポンが届いています。</p>
                    <div style="background:#f8f6f0;border:2px dashed #C4A35A;border-radius:8px;padding:16px;text-align:center;margin:20px 0;">
                      <p style="color:#666;font-size:12px;margin:0 0 4px;">クーポン内容</p>
                      <p style="color:#1A1A2E;font-size:18px;font-weight:bold;margin:0;">${pro.coupon_text}</p>
                    </div>
                    <p style="color:#666;font-size:13px;">クーポンを使用するには、以下からログインしてください。</p>
                    <div style="text-align:center;margin:24px 0;">
                      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://forte-mvp.vercel.app'}/coupons?email=${encodeURIComponent(vote.voter_email)}"
                         style="background:#C4A35A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
                        ログインしてクーポンを受け取る
                      </a>
                    </div>
                    <p style="color:#999;font-size:11px;">※ クーポンは対面時にプロの前で「使用する」ボタンを押してご利用ください。</p>
                  </div>
                  <div style="padding:16px;text-align:center;background:#f9f9f9;border-radius:0 0 12px 12px;">
                    <p style="color:#999;font-size:11px;margin:0;">REAL PROOF — 強みで証明されたプロに出会う</p>
                  </div>
                </div>
              `,
            }),
          })
        } catch (err) {
          console.error('Coupon email send failed:', err)
        }
      }

      // クーポン情報をリダイレクトに含める
      return NextResponse.redirect(
        new URL(`/vote-confirmed?pro=${professionalId}&coupon=${encodeURIComponent(pro.coupon_text)}&email=${encodeURIComponent(vote.voter_email)}`, req.url)
      )
    }
  }

  // 確認完了ページにリダイレクト（クーポンなし）
  return NextResponse.redirect(
    new URL(`/vote-confirmed?pro=${professionalId}`, req.url)
  )
}
