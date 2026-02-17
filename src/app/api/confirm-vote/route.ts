import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/vote-error?reason=missing-token', req.url))
  }

  try {
    // Step 1: トークンで確認レコードを取得
    const { data: confirmation, error: confirmError } = await supabaseAdmin
      .from('vote_confirmations')
      .select('*')
      .eq('token', token)
      .is('confirmed_at', null)
      .single()

    if (confirmError || !confirmation) {
      console.error('[confirm-vote] Step 1 FAIL - token lookup:', confirmError?.message)
      return NextResponse.redirect(new URL('/vote-error?reason=invalid-token', req.url))
    }

    console.log('[confirm-vote] Step 1 OK - confirmation id:', confirmation.id, 'vote_id:', confirmation.vote_id)

    // Step 2: 確認処理 - confirmationを更新
    const { error: updateConfirmError } = await supabaseAdmin
      .from('vote_confirmations')
      .update({ confirmed_at: new Date().toISOString() })
      .eq('id', confirmation.id)

    if (updateConfirmError) {
      console.error('[confirm-vote] Step 2 FAIL - update confirmation:', updateConfirmError.message)
    } else {
      console.log('[confirm-vote] Step 2 OK - confirmation marked as confirmed')
    }

    // Step 3: 投票ステータスをconfirmedに更新
    const { error: updateVoteError } = await supabaseAdmin
      .from('votes')
      .update({ status: 'confirmed' })
      .eq('id', confirmation.vote_id)

    if (updateVoteError) {
      console.error('[confirm-vote] Step 3 FAIL - update vote status:', updateVoteError.message)
    } else {
      console.log('[confirm-vote] Step 3 OK - vote status set to confirmed')
    }

    // Step 4: 投票データを別途取得
    const { data: vote, error: voteError } = await supabaseAdmin
      .from('votes')
      .select('*')
      .eq('id', confirmation.vote_id)
      .single()

    if (voteError || !vote) {
      console.error('[confirm-vote] Step 4 FAIL - fetch vote:', voteError?.message, 'vote_id:', confirmation.vote_id)
      return NextResponse.redirect(new URL('/vote-confirmed', req.url))
    }

    console.log('[confirm-vote] Step 4 OK - vote:', {
      id: vote.id,
      professional_id: vote.professional_id,
      voter_email: vote.voter_email,
      status: vote.status,
    })

    const professionalId = vote.professional_id

    if (!professionalId) {
      console.error('[confirm-vote] No professional_id on vote:', vote.id)
      return NextResponse.redirect(new URL('/vote-confirmed', req.url))
    }

    // Step 5: プロ情報取得
    const { data: pro, error: proError } = await supabaseAdmin
      .from('professionals')
      .select('id, user_id, name, coupon_text')
      .eq('id', professionalId)
      .single()

    if (proError || !pro) {
      console.error('[confirm-vote] Step 5 FAIL - fetch pro:', proError?.message, 'professionalId:', professionalId)
      return NextResponse.redirect(new URL(`/vote-confirmed?pro=${professionalId}`, req.url))
    }

    console.log('[confirm-vote] Step 5 OK - pro:', {
      id: pro.id,
      name: pro.name,
      user_id: pro.user_id,
      coupon_text: pro.coupon_text,
    })

    // Step 6: クーポン発行判定
    if (!pro.coupon_text) {
      console.log('[confirm-vote] Step 6 SKIP - pro has no coupon_text')
      return NextResponse.redirect(new URL(`/vote-confirmed?pro=${professionalId}`, req.url))
    }

    if (!vote.voter_email) {
      console.error('[confirm-vote] Step 6 SKIP - vote has no voter_email')
      return NextResponse.redirect(new URL(`/vote-confirmed?pro=${professionalId}`, req.url))
    }

    // Step 6: クーポン作成
    console.log('[confirm-vote] Step 6 - Creating coupon:', {
      pro_user_id: pro.id,
      client_email: vote.voter_email,
      coupon_text: pro.coupon_text,
    })

    const couponCode = Math.random().toString(36).substring(2, 10).toUpperCase()
    const { data: couponData, error: couponError } = await supabaseAdmin
      .from('coupons')
      .insert({
        pro_user_id: pro.id,
        client_email: vote.voter_email,
        discount_type: 'percentage',
        discount_value: 10,
        code: couponCode,
        status: 'active',
      })
      .select()

    if (couponError) {
      console.error('[confirm-vote] Step 6 FAIL - coupon insert:', couponError.message, couponError.details, couponError.hint)
    } else {
      console.log('[confirm-vote] Step 6 OK - coupon created:', couponData)
    }

    // Step 7: クーポンメール送信
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
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
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://forte-mvp.vercel.app'}/login?role=client&redirect=/coupons&email=${encodeURIComponent(vote.voter_email)}"
                       style="background:#C4A35A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
                      登録してクーポンを受け取る
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

        if (!emailRes.ok) {
          const errBody = await emailRes.text()
          console.error('[confirm-vote] Step 7 FAIL - coupon email:', emailRes.status, errBody)
        } else {
          console.log('[confirm-vote] Step 7 OK - coupon email sent to:', vote.voter_email)
        }
      } catch (err) {
        console.error('[confirm-vote] Step 7 FAIL - coupon email exception:', err)
      }
    } else {
      console.log('[confirm-vote] Step 7 SKIP - RESEND_API_KEY not set')
    }

    // クーポン情報をリダイレクトに含める
    return NextResponse.redirect(
      new URL(`/vote-confirmed?pro=${professionalId}&coupon=${encodeURIComponent(pro.coupon_text)}&email=${encodeURIComponent(vote.voter_email)}`, req.url)
    )
  } catch (err) {
    console.error('[confirm-vote] Unexpected error:', err)
    return NextResponse.redirect(new URL('/vote-error?reason=invalid-token', req.url))
  }
}
