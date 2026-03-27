import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clerkClient } from '@clerk/nextjs/server'
import { checkExpertBadges } from '@/lib/expert-badges'
import { normalizeEmail } from '@/lib/normalize-email'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: (url: any, init: any) =>
          fetch(url, { ...init, cache: 'no-store' }),
      },
    }
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

      // invalid_grant = codeが既に使用済み → 1回目のcallbackで投票成功済みの可能性
      if (errBody.includes('invalid_grant')) {
        // 1回目のcallbackがINSERTを完了するのを待つ
        await new Promise(resolve => setTimeout(resolve, 1500))

        try {
          const supabaseCheck = getSupabaseAdmin()
          const { data: existingVote } = await supabaseCheck
            .from('votes')
            .select('id')
            .eq('professional_id', professional_id)
            .eq('status', 'confirmed')
            .gt('created_at', new Date(Date.now() - 30000).toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (existingVote) {
            console.log('[vote-auth/google/callback] invalid_grant but vote exists, redirecting to vote-confirmed')
            return NextResponse.redirect(
              new URL(`/vote-confirmed?pro=${professional_id}&vote_id=${existingVote.id}&auth_method=google`, origin)
            )
          }
        } catch (e) {
          console.error('[vote-auth/google/callback] Recovery check failed:', e)
        }
      }

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
      .eq('normalized_email', normalizeEmail(email))
      .maybeSingle()

    if (existingVote) {
      return NextResponse.redirect(
        new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=already_voted`, origin)
      )
    }

    // Step 5: 自己投票チェック（実在カラムのみ + デバッグログ付き）
    const { data: proData } = await supabaseAdmin
      .from('professionals')
      .select('user_id, contact_email')
      .eq('id', professional_id)
      .maybeSingle()

    // 投票者のClerkアカウント情報を取得（自己投票チェック + Step 9cで再利用）
    let voterClerkUserId: string | null = null
    let hasAccount = false
    try {
      const clerk = await clerkClient()
      const users = await clerk.users.getUserList({ emailAddress: [email] })
      hasAccount = users.data.length > 0
      if (hasAccount) {
        voterClerkUserId = users.data[0].id
      }
    } catch (e) {
      console.error('[vote-auth/google/callback] Clerk voter lookup failed:', e)
    }

    // デバッグログ（必ず出力）
    console.log('SELF_VOTE_CHECK:', JSON.stringify({
      googleEmail: email,
      proUserId: proData?.user_id,
      proEmail: proData?.contact_email,
      clerkUserId: voterClerkUserId,
    }))

    // Check 1: user_id照合（最も確実）
    if (voterClerkUserId && proData?.user_id && voterClerkUserId === proData.user_id) {
      console.log('SELF_VOTE_BLOCKED: user_id match')
      return NextResponse.redirect(
        new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=self_vote`, origin)
      )
    }

    // Check 2: メール照合（contact_email）
    if (proData?.contact_email && email &&
        proData.contact_email.toLowerCase() === email.toLowerCase()) {
      console.log('SELF_VOTE_BLOCKED: email match')
      return NextResponse.redirect(
        new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=self_vote`, origin)
      )
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
        normalized_email: normalizeEmail(email),
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
    let googleRid = ''
    if (voteData.selected_reward_id) {
      const { data: crData, error: rewardError } = await supabaseAdmin.from('client_rewards').insert({
        vote_id: insertedVote.id,
        reward_id: voteData.selected_reward_id,
        professional_id,
        client_email: email,
        status: 'active',
      }).select('id').maybeSingle()
      if (rewardError) {
        console.error('[vote-auth/google/callback] client_rewards INSERT error:', rewardError)
      }
      if (crData?.id) googleRid = crData.id
    }

    // Step 9d: PROVEN/SPECIALIST通知チェック（15票/30票到達時のメール通知）
    try {
      const PROVEN_THRESHOLD = 15
      const SPECIALIST_THRESHOLD = 30
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
          .select('id, name, contact_email, proven_notified_items, specialist_notified_items')
          .eq('id', professional_id)
          .maybeSingle()

        if (summary && proForNotif?.contact_email) {
          const provenNotified: string[] = proForNotif.proven_notified_items || []
          const newProvenNotified = [...provenNotified]
          const specialistNotified: string[] = proForNotif.specialist_notified_items || []
          const newSpecialistNotified = [...specialistNotified]

          // proof_items のラベルマップ
          const { data: proofItems } = await supabaseAdmin
            .from('proof_items')
            .select('id, label')

          const labelMap = new Map<string, string>()
          for (const item of proofItems || []) {
            labelMap.set(item.id, item.label)
          }

          const resendKey = process.env.RESEND_API_KEY

          for (const proofId of selectedProofIds) {
            const item = summary.find((s: any) => s.proof_id === proofId)
            if (!item) continue

            const categoryName = labelMap.get(proofId) || proofId

            // Lv.1: PROVEN通知（15票ちょうど）
            if (item.vote_count === PROVEN_THRESHOLD && !provenNotified.includes(proofId)) {
              if (resendKey) {
                await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${resendKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    from: 'REALPROOF <noreply@realproof.jp>',
                    to: proForNotif.contact_email,
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
              newProvenNotified.push(proofId)
            }

            // Lv.2: SPECIALIST通知（30票ちょうど）
            if (item.vote_count === SPECIALIST_THRESHOLD && !specialistNotified.includes(proofId)) {
              if (resendKey) {
                await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${resendKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    from: 'REALPROOF <noreply@realproof.jp>',
                    to: proForNotif.contact_email,
                    subject: '🏆 REALPROOF認定達成！',
                    html: `
                      <div style="font-family: 'Noto Sans JP', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
                        <h1 style="color: #D4A843; font-size: 24px;">🏆 REALPROOF認定達成！</h1>
                        <p>${proForNotif.name}さん、おめでとうございます！</p>
                        <p>「<strong>${categoryName}</strong>」が30プルーフに到達しました。</p>
                        <p>REALPROOF認定 <strong>「${categoryName}スペシャリスト」</strong> として、
                        賞状と名前入り特別カードを申請できます。</p>
                        <div style="margin-top: 24px;">
                          <a href="https://realproof.jp/dashboard"
                             style="background: #D4A843; color: #1A1A2E; padding: 12px 24px;
                                    text-decoration: none; border-radius: 8px; font-weight: bold;">
                            認定を申請する
                          </a>
                        </div>
                        <p style="color: #888; font-size: 12px; margin-top: 32px;">REALPROOF — 強みがあなたを定義する。</p>
                      </div>
                    `
                  }),
                })
                console.log(`[vote-auth/google/callback] SPECIALIST email sent for ${categoryName}`)
              }
              newSpecialistNotified.push(proofId)
            }
          }

          // 通知済みリスト更新
          const updates: any = {}
          if (newProvenNotified.length > provenNotified.length) {
            updates.proven_notified_items = newProvenNotified
          }
          if (newSpecialistNotified.length > specialistNotified.length) {
            updates.specialist_notified_items = newSpecialistNotified
          }
          if (Object.keys(updates).length > 0) {
            await supabaseAdmin
              .from('professionals')
              .update(updates)
              .eq('id', professional_id)
          }
        }
      }
    } catch (err) {
      console.error('[vote-auth/google/callback] PROVEN/SPECIALIST notification error:', err)
      // メール失敗で投票レスポンスをブロックしない
    }

    // Step 9e: エキスパートバッジ自動チェック
    await checkExpertBadges(supabaseAdmin, professional_id)

    // Step 9c: 投票者のロール判定（Clerk情報はStep 5で取得済み）
    let voterIsPro = false
    if (hasAccount && voterClerkUserId) {
      try {
        const { data: voterPro } = await supabaseAdmin
          .from('professionals')
          .select('id')
          .eq('user_id', voterClerkUserId)
          .maybeSingle()
        voterIsPro = !!voterPro
      } catch (e) {
        console.error('[vote-auth/google/callback] Voter pro check failed:', e)
      }
    }

    // Step 10: vote-confirmed にリダイレクト
    const redirectParams = new URLSearchParams({
      pro: professional_id,
      vote_id: insertedVote.id,
      auth_method: 'google',
      has_account: hasAccount ? 'true' : 'false',
      role: voterIsPro ? 'pro' : 'client',
    })
    if (googleRid) redirectParams.set('rid', googleRid)

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
