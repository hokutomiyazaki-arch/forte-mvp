import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clerkClient } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const error = searchParams.get('error')
  const origin = request.nextUrl.origin

  // Google認証がキャンセルされた場合
  if (error || !code || !stateParam) {
    console.error('[vote-auth/google/callback] Auth error or cancelled:', error)
    let redirectPath = '/'
    if (stateParam) {
      try {
        const stateData = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
        const tokenParam = stateData.qr_token ? `?token=${stateData.qr_token}&error=google_cancelled` : '?error=google_cancelled'
        redirectPath = `/vote/${stateData.professional_id}${tokenParam}`
      } catch {}
    }
    return NextResponse.redirect(new URL(redirectPath, origin))
  }

  // state デコード
  let stateData: {
    nonce: string
    professional_id: string
    qr_token: string
    vote_data: string
  }

  try {
    stateData = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
  } catch {
    console.error('[vote-auth/google/callback] Invalid state parameter')
    return NextResponse.redirect(new URL('/?error=invalid_state', origin))
  }

  const { professional_id, qr_token, vote_data: vote_data_str } = stateData
  const votePageUrl = `/vote/${professional_id}${qr_token ? `?token=${qr_token}` : ''}`

  try {
    // Step 1: code → access_token + id_token（Google OAuth token exchange）
    const clientId = process.env.GOOGLE_CLIENT_ID!
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
    const redirectUri = `${origin}/api/vote-auth/google/callback`

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      console.error('[vote-auth/google/callback] Token exchange failed:', tokenRes.status, errBody)
      return NextResponse.redirect(new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=google_failed`, origin))
    }

    const tokenData = await tokenRes.json()
    console.log('[vote-auth/google/callback] Token exchange OK')

    // Step 2: メールアドレス取得（id_tokenからデコード）
    let email = ''

    if (tokenData.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokenData.id_token.split('.')[1], 'base64').toString()
        )
        email = payload.email || ''
        console.log('[vote-auth/google/callback] Email from id_token:', email ? 'found' : 'not found')
      } catch (e) {
        console.error('[vote-auth/google/callback] Failed to decode id_token:', e)
      }
    }

    // Googleでメールが取れないことは基本ないが、念のため
    if (!email) {
      console.log('[vote-auth/google/callback] No email - trying userinfo endpoint')
      // フォールバック: userinfo endpoint で取得
      try {
        const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
        })
        if (userinfoRes.ok) {
          const userinfo = await userinfoRes.json()
          email = userinfo.email || ''
        }
      } catch (e) {
        console.error('[vote-auth/google/callback] Userinfo fetch failed:', e)
      }
    }

    if (!email) {
      console.error('[vote-auth/google/callback] Could not get email')
      return NextResponse.redirect(
        new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=google_no_email`, origin)
      )
    }

    email = email.trim().toLowerCase()

    // Step 3: 投票データをパース
    let voteData: any
    try {
      voteData = JSON.parse(decodeURIComponent(vote_data_str))
    } catch {
      console.error('[vote-auth/google/callback] Invalid vote_data')
      return NextResponse.redirect(new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=invalid_vote_data`, origin))
    }

    const supabaseAdmin = getSupabaseAdmin()

    // Step 4: 重複投票チェック
    const { data: existingVote } = await supabaseAdmin
      .from('votes')
      .select('id')
      .eq('professional_id', professional_id)
      .eq('voter_email', email)
      .maybeSingle()

    if (existingVote) {
      return NextResponse.redirect(
        new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=already_voted`, origin)
      )
    }

    // Step 5: 自己投票チェック
    const { data: proData } = await supabaseAdmin
      .from('professionals')
      .select('user_id')
      .eq('id', professional_id)
      .maybeSingle()

    if (proData?.user_id) {
      const { data: clientData } = await supabaseAdmin
        .from('clients')
        .select('user_id')
        .eq('email', email)
        .maybeSingle()

      if (clientData?.user_id === proData.user_id) {
        return NextResponse.redirect(
          new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=self_vote`, origin)
        )
      }
    }

    // Step 6: 30分クールダウンチェック
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: recentVote } = await supabaseAdmin
      .from('votes')
      .select('created_at')
      .eq('professional_id', professional_id)
      .gt('created_at', thirtyMinAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentVote) {
      return NextResponse.redirect(
        new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=cooldown`, origin)
      )
    }

    // Step 7: 投票INSERT（Google認証済みなので status='confirmed'）
    const { data: insertedVote, error: voteError } = await supabaseAdmin
      .from('votes')
      .insert({
        professional_id,
        voter_email: email,
        client_user_id: null,
        session_count: voteData.session_count || 'first',
        vote_weight: voteData.session_count === 'first' ? 0.5 : 1.0,
        vote_type: voteData.vote_type || 'personality_only',
        selected_proof_ids: voteData.selected_proof_ids || null,
        selected_personality_ids: voteData.selected_personality_ids || null,
        selected_reward_id: voteData.selected_reward_id || null,
        comment: voteData.comment || null,
        qr_token: qr_token || null,
        status: 'confirmed',
      })
      .select()
      .maybeSingle()

    if (voteError) {
      console.error('[vote-auth/google/callback] Vote INSERT error:', voteError)
      if (voteError.code === '23505') {
        return NextResponse.redirect(
          new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=already_voted`, origin)
        )
      }
      return NextResponse.redirect(
        new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=vote_failed`, origin)
      )
    }

    if (!insertedVote) {
      console.error('[vote-auth/google/callback] Vote INSERT returned null')
      return NextResponse.redirect(
        new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=vote_failed`, origin)
      )
    }

    console.log('[vote-auth/google/callback] Vote inserted:', insertedVote.id)

    // Step 8: vote_emails に記録
    try {
      await supabaseAdmin.from('vote_emails').insert({
        email,
        professional_id,
        source: 'google',
      })
    } catch {
      // 失敗しても投票には影響しない
    }

    // Step 9: リワード処理
    if (voteData.selected_reward_id) {
      const { error: rewardError } = await supabaseAdmin.from('client_rewards').insert({
        vote_id: insertedVote.id,
        reward_id: voteData.selected_reward_id,
        professional_id,
        client_email: email,
        status: 'active',
      })
      if (rewardError) {
        console.error('[vote-auth/google/callback] client_rewards INSERT error:', rewardError)
      }
    }

    // Step 9b: リワード通知メール送信
    if (voteData.selected_reward_id && email) {
      try {
        const { data: proInfo } = await supabaseAdmin
          .from('professionals')
          .select('name')
          .eq('id', professional_id)
          .maybeSingle()

        const { data: rewardInfo } = await supabaseAdmin
          .from('rewards')
          .select('reward_type, content, title')
          .eq('id', voteData.selected_reward_id)
          .maybeSingle()

        const resendKey = process.env.RESEND_API_KEY
        if (resendKey && proInfo?.name && rewardInfo) {
          const { getRewardLabel } = await import('@/lib/types')
          const displayLabel = rewardInfo.title || getRewardLabel(rewardInfo.reward_type)
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://realproof.jp'

          const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'REALPROOF <info@proof-app.jp>',
              to: email,
              subject: `${proInfo.name}さんからリワードが届いています`,
              html: `
                <div style="max-width:480px;margin:0 auto;font-family:sans-serif;">
                  <div style="background:#1A1A2E;padding:24px;border-radius:12px 12px 0 0;">
                    <h1 style="color:#C4A35A;font-size:14px;margin:0;">REALPROOF</h1>
                  </div>
                  <div style="padding:24px;background:#fff;border:1px solid #eee;">
                    <p style="color:#333;">プルーフありがとうございます！</p>
                    <p style="color:#333;">${proInfo.name}さんからリワードが届いています。</p>
                    <div style="background:#f8f6f0;border:2px dashed #C4A35A;border-radius:8px;padding:16px;text-align:center;margin:20px 0;">
                      <p style="color:#666;font-size:12px;margin:0 0 4px;">${displayLabel}</p>
                      <p style="color:#666;font-size:14px;margin:0;">リワードの中身は下のボタンから確認できます</p>
                    </div>
                    <div style="text-align:center;margin:24px 0;">
                      <a href="${appUrl}/vote-confirmed?pro=${professional_id}&vote_id=${insertedVote.id}"
                         style="display:inline-block;background:#C4A35A;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:14px;text-align:center;">
                        リワードを確認する
                      </a>
                    </div>
                  </div>
                  <div style="padding:16px;text-align:center;background:#f9f9f9;border-radius:0 0 12px 12px;">
                    <p style="color:#999;font-size:11px;margin:0;">REALPROOF — 強みで証明されたプロに出会う</p>
                  </div>
                </div>
              `,
            }),
          })

          if (!emailRes.ok) {
            console.error('[vote-auth/google/callback] Reward email failed:', emailRes.status)
          } else {
            console.log('[vote-auth/google/callback] Reward email sent to:', email)
          }
        }
      } catch (err) {
        console.error('[vote-auth/google/callback] Reward email error:', err)
      }
    }

    // Step 9d: PROVEN通知チェック（15票到達時のメール通知）
    try {
      const PROVEN_THRESHOLD = 15
      const selectedProofIds: string[] = voteData.selected_proof_ids || []
      if (selectedProofIds.length > 0) {
        // このプロの最新vote_summaryを取得
        const { data: summary } = await supabaseAdmin
          .from('vote_summary')
          .select('*')
          .eq('professional_id', professional_id)

        // プロの情報取得（名前、メール、通知済みリスト）
        const { data: proForNotif } = await supabaseAdmin
          .from('professionals')
          .select('id, name, email, proven_notified_items')
          .eq('id', professional_id)
          .maybeSingle()

        if (summary && proForNotif?.email) {
          const notified: string[] = proForNotif.proven_notified_items || []
          const newNotified = [...notified]

          // proof_items のラベルマップ
          const { data: proofItems } = await supabaseAdmin
            .from('proof_items')
            .select('id, label')

          const labelMap = new Map<string, string>()
          for (const item of proofItems || []) {
            labelMap.set(item.id, item.label)
          }

          for (const proofId of selectedProofIds) {
            const item = summary.find((s: any) => s.proof_id === proofId)
            if (!item || item.vote_count !== PROVEN_THRESHOLD) continue
            if (notified.includes(proofId)) continue

            const categoryName = labelMap.get(proofId) || proofId
            // PROVEN達成メール送信
            const resendKey = process.env.RESEND_API_KEY
            if (resendKey) {
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${resendKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  from: 'REALPROOF <noreply@realproof.jp>',
                  to: proForNotif.email,
                  subject: '✦ PROVEN達成！',
                  html: `
                    <div style="font-family: 'Noto Sans JP', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
                      <h1 style="color: #D4A843; font-size: 24px;">✦ PROVEN達成！</h1>
                      <p>${proForNotif.name}さん、おめでとうございます！</p>
                      <p>「<strong>${categoryName}</strong>」が15プルーフに到達し、
                      <span style="color: #D4A843; font-weight: bold;">PROVEN（証明済み）</span>になりました。</p>
                      <p>あなたの強みが認められています。</p>
                      <div style="margin-top: 24px;">
                        <a href="https://realproof.jp/dashboard"
                           style="background: #D4A843; color: #1A1A2E; padding: 12px 24px;
                                  text-decoration: none; border-radius: 8px; font-weight: bold;">
                          プロフィールを見る
                        </a>
                      </div>
                      <p style="color: #888; font-size: 12px; margin-top: 32px;">REALPROOF — 強みがあなたを定義する。</p>
                    </div>
                  `
                }),
              })
              console.log(`[vote-auth/google/callback] PROVEN email sent for ${categoryName}`)
            }
            newNotified.push(proofId)
          }

          // 通知済みリスト更新
          if (newNotified.length > notified.length) {
            await supabaseAdmin
              .from('professionals')
              .update({ proven_notified_items: newNotified })
              .eq('id', professional_id)
          }
        }
      }
    } catch (err) {
      console.error('[vote-auth/google/callback] PROVEN notification error:', err)
      // メール失敗で投票レスポンスをブロックしない
    }

    // Step 9c: Clerkアカウント存在チェック
    let hasAccount = false
    try {
      const clerk = await clerkClient()
      const users = await clerk.users.getUserList({ emailAddress: [email] })
      hasAccount = users.data.length > 0
    } catch (e) {
      console.error('[vote-auth/google/callback] Clerk user check failed:', e)
    }

    // Step 10: vote-confirmed にリダイレクト
    const redirectParams = new URLSearchParams({
      pro: professional_id,
      vote_id: insertedVote.id,
      auth_method: 'google',
      has_account: hasAccount ? 'true' : 'false',
    })

    console.log('[vote-auth/google/callback] Success! Redirecting to vote-confirmed')
    return NextResponse.redirect(
      new URL(`/vote-confirmed?${redirectParams.toString()}`, origin)
    )

  } catch (err) {
    console.error('[vote-auth/google/callback] Unexpected error:', err)
    return NextResponse.redirect(
      new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=unexpected`, origin)
    )
  }
}
