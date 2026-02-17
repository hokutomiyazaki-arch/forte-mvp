import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRewardLabel } from '@/lib/types'

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
    // Step 1: トークンで確認レコードを取得（confirmed_at の有無問わず）
    const { data: confirmation, error: confirmError } = await supabaseAdmin
      .from('vote_confirmations')
      .select('*')
      .eq('token', token)
      .single()

    if (confirmError || !confirmation) {
      console.error('[confirm-vote] Step 1 FAIL - token lookup:', confirmError?.message)
      return NextResponse.redirect(new URL('/vote-error?reason=invalid-token', req.url))
    }

    const alreadyConfirmed = !!confirmation.confirmed_at
    console.log('[confirm-vote] Step 1 OK - confirmation id:', confirmation.id, 'vote_id:', confirmation.vote_id, 'alreadyConfirmed:', alreadyConfirmed)

    if (!alreadyConfirmed) {
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
    }

    // Step 4: 投票データを取得
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
      .select('id, user_id, name')
      .eq('id', professionalId)
      .single()

    if (proError || !pro) {
      console.error('[confirm-vote] Step 5 FAIL - fetch pro:', proError?.message, 'professionalId:', professionalId)
      return NextResponse.redirect(new URL(`/vote-confirmed?pro=${professionalId}`, req.url))
    }

    console.log('[confirm-vote] Step 5 OK - pro:', { id: pro.id, name: pro.name })

    // Step 5b: client_reward と reward 情報を取得
    const { data: clientReward } = await supabaseAdmin
      .from('client_rewards')
      .select('id, reward_id')
      .eq('vote_id', vote.id)
      .maybeSingle()

    let rewardType = ''
    let rewardContent = ''

    if (clientReward) {
      const { data: rewardData } = await supabaseAdmin
        .from('rewards')
        .select('reward_type, content')
        .eq('id', clientReward.reward_id)
        .maybeSingle()

      if (rewardData) {
        rewardType = rewardData.reward_type
        rewardContent = rewardData.content
      }

      console.log('[confirm-vote] Step 5b OK - reward:', { rewardType, rewardContent })
    } else {
      console.log('[confirm-vote] Step 5b - no client_reward for this vote')
    }

    // 初回確認時のみ: リワードをアクティブにしてメール送信
    if (!alreadyConfirmed) {
      // Step 6: リワードをアクティブに
      if (clientReward) {
        const { error: rewardUpdateError } = await supabaseAdmin
          .from('client_rewards')
          .update({ status: 'active' })
          .eq('id', clientReward.id)

        if (rewardUpdateError) {
          console.error('[confirm-vote] Step 6 FAIL - reward update:', rewardUpdateError.message)
        } else {
          console.log('[confirm-vote] Step 6 OK - client_reward activated')
        }
      }

      // Step 7: リワードメール送信
      const resendKey = process.env.RESEND_API_KEY
      if (resendKey && rewardType && vote.voter_email) {
        const rewardLabel = getRewardLabel(rewardType)
        const isCouponReward = rewardType === 'coupon'
        // クーポンのみ内容を開示、それ以外は種類名だけ
        const contentHtml = isCouponReward && rewardContent
          ? `<p style="color:#1A1A2E;font-size:18px;font-weight:bold;margin:0;">${rewardContent}</p>`
          : `<p style="color:#666;font-size:14px;margin:0;">ログインしてリワードの中身を確認してください。</p>`
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
              subject: `${pro.name}さんからリワードが届いています`,
              html: `
                <div style="max-width:480px;margin:0 auto;font-family:sans-serif;">
                  <div style="background:#1A1A2E;padding:24px;border-radius:12px 12px 0 0;">
                    <h1 style="color:#C4A35A;font-size:14px;margin:0;">REAL PROOF</h1>
                  </div>
                  <div style="padding:24px;background:#fff;border:1px solid #eee;">
                    <p style="color:#333;">プルーフの確認ありがとうございます！</p>
                    <p style="color:#333;">${pro.name}さんからリワードが届いています。</p>
                    <div style="background:#f8f6f0;border:2px dashed #C4A35A;border-radius:8px;padding:16px;text-align:center;margin:20px 0;">
                      <p style="color:#666;font-size:12px;margin:0 0 4px;">${rewardLabel}</p>
                      ${contentHtml}
                    </div>
                    <div style="text-align:center;margin:24px 0;">
                      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://forte-mvp.vercel.app'}/mycard"
                         style="display:inline-block;background:#C4A35A;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:14px;text-align:center;">
                        リワードを確認する
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

          if (!emailRes.ok) {
            const errBody = await emailRes.text()
            console.error('[confirm-vote] Step 7 FAIL - reward email:', emailRes.status, errBody)
          } else {
            console.log('[confirm-vote] Step 7 OK - reward email sent to:', vote.voter_email)
          }
        } catch (err) {
          console.error('[confirm-vote] Step 7 FAIL - reward email exception:', err)
        }
      } else {
        console.log('[confirm-vote] Step 7 SKIP - no RESEND_API_KEY or no reward type')
      }
    } else {
      console.log('[confirm-vote] Already confirmed - skipping Steps 2-7, redirecting to vote-confirmed')
    }

    // リワード情報をリダイレクトに含める
    const redirectParams = new URLSearchParams({ pro: professionalId })
    if (rewardType) redirectParams.set('reward_type', rewardType)
    if (rewardContent) redirectParams.set('reward_content', rewardContent)
    if (vote.voter_email) redirectParams.set('email', vote.voter_email)

    return NextResponse.redirect(
      new URL(`/vote-confirmed?${redirectParams.toString()}`, req.url)
    )
  } catch (err) {
    console.error('[confirm-vote] Unexpected error:', err)
    return NextResponse.redirect(new URL('/vote-error?reason=invalid-token', req.url))
  }
}
