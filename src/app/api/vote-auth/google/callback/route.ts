import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clerkClient } from '@clerk/nextjs/server'

import { normalizeEmail } from '@/lib/normalize-email'
import { computeProofHash, generateNonce, GENESIS_HASH } from '@/lib/proof-chain'
import { checkVoterIsPro } from '@/lib/voter-pro-check'
import { checkVoteDuplicates } from '@/lib/vote-duplicate-check'
import { extractDisplayName } from '@/lib/vote-auth-helpers'

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
    let googlePictureUrl: string | null = null
    let googleName: string | null = null
    let googleGivenName: string | null = null
    let googleFamilyName: string | null = null

    if (tokenData.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokenData.id_token.split('.')[1], 'base64').toString()
        )
        email = payload.email || ''
        googlePictureUrl = payload.picture || null
        googleName = payload.name || null
        googleGivenName = payload.given_name || null
        googleFamilyName = payload.family_name || null
        console.log('[vote-auth/google/callback] Email from id_token:', email ? 'found' : 'not found')
      } catch (e) {
        console.error('[vote-auth/google/callback] Failed to decode id_token:', e)
      }
    }

    // Googleでメールが取れない、または picture/name がない場合は userinfo endpoint で補完
    if (!email || !googlePictureUrl || !googleName) {
      if (!email) {
        console.log('[vote-auth/google/callback] No email - trying userinfo endpoint')
      }
      // フォールバック: userinfo endpoint で取得
      try {
        const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
        })
        if (userinfoRes.ok) {
          const userinfo = await userinfoRes.json()
          if (!email) email = userinfo.email || ''
          if (!googlePictureUrl) googlePictureUrl = userinfo.picture || null
          if (!googleName) googleName = userinfo.name || null
          if (!googleGivenName) googleGivenName = userinfo.given_name || null
          if (!googleFamilyName) googleFamilyName = userinfo.family_name || null
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

    // Step 4: 重複チェック（7日リピート / 30分クールダウン / 1分ダブルサブミット）
    const dupeResult = await checkVoteDuplicates(supabaseAdmin, {
      voterIdentifier: email,
      professionalId: professional_id,
    })
    if (!dupeResult.ok) {
      if (dupeResult.reason === 'duplicate_submit' && dupeResult.existingVoteId) {
        console.log('[vote-auth/google/callback] Double submit detected:', normalizeEmail(email), professional_id)
        return NextResponse.redirect(
          new URL(`/vote-confirmed?pro=${professional_id}&vote_id=${dupeResult.existingVoteId}&auth_method=google`, origin)
        )
      }
      const errKey = dupeResult.reason === 'cooldown' ? 'cooldown' : 'already_voted'
      const errUrl = new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=${errKey}`, origin)
      // cooldown 時は残り分数を URL に付与してフロントで「あとN分後」を正確表示
      if (dupeResult.reason === 'cooldown' && dupeResult.cooldownRemainingMinutes) {
        errUrl.searchParams.set('remaining', String(dupeResult.cooldownRemainingMinutes))
      }
      return NextResponse.redirect(errUrl)
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

    // Step 6: （重複/クールダウンチェックは Step 4 の checkVoteDuplicates で統一済み）

    // --- ハッシュチェーン処理 START ---
    const { data: latestVote } = await supabaseAdmin
      .from('votes')
      .select('proof_hash')
      .not('proof_hash', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const prevHash = latestVote?.proof_hash || GENESIS_HASH
    const nonce = generateNonce()
    const createdAt = new Date().toISOString()

    const proofHash = computeProofHash({
      voter_email: normalizeEmail(email),
      professional_id,
      vote_type: voteData.vote_type || 'personality_only',
      selected_proof_ids: voteData.selected_proof_ids || null,
      comment: voteData.comment || null,
      created_at: createdAt,
      nonce,
      prev_hash: prevHash,
    })
    // --- ハッシュチェーン処理 END ---

    // --- Phase 1 Step 2/3: Clerk imageUrl + 表示名 + プロ判定 ---
    // 優先度1: Clerk(従来通り) → 優先度2: Google id_token / userinfo
    let clientPhotoUrl: string | null = null
    let authDisplayName: string | null = null
    if (voterClerkUserId) {
      try {
        const clerk = await clerkClient()
        const voterClerkUser = await clerk.users.getUser(voterClerkUserId)
        clientPhotoUrl = voterClerkUser.imageUrl || null
        // Phase 1 Step 3: 姓+名 → fullName → firstName → username の優先順で抽出
        authDisplayName = extractDisplayName(voterClerkUser)
      } catch (e) {
        console.error('[vote-auth/google/callback] Clerk imageUrl fetch failed:', e)
      }
    }

    // 優先度2: Clerk未登録 or Clerk取得失敗時、Google id_token / userinfo クレームから補完
    if (!clientPhotoUrl && googlePictureUrl) {
      clientPhotoUrl = googlePictureUrl
    }
    if (!authDisplayName && googleName) {
      authDisplayName = googleName
    }
    // 優先度3: name が無い場合、family_name + given_name を結合
    if (!authDisplayName && (googleFamilyName || googleGivenName)) {
      authDisplayName = [googleFamilyName, googleGivenName].filter(Boolean).join(' ') || null
    }
    const voterProfessionalId = await checkVoterIsPro(
      normalizeEmail(email),
      voterClerkUserId
    )

    // Step 7: 投票INSERT（Google認証済みなので status='confirmed'）
    const { data: insertedVote, error: voteError } = await supabaseAdmin
      .from('votes')
      .insert({
        professional_id,
        voter_email: email,
        normalized_email: normalizeEmail(email),
        client_user_id: null,
        vote_weight: 1.0,
        vote_type: voteData.vote_type || 'personality_only',
        selected_proof_ids: voteData.selected_proof_ids || null,
        selected_personality_ids: voteData.selected_personality_ids || null,
        selected_reward_id: voteData.selected_reward_id || null,
        comment: voteData.comment || null,
        qr_token: qr_token || null,
        status: 'confirmed',
        // --- Phase 1 Step 3 修正: auth_method 欠落バグ（DB default 'email' に
        //     引き継がれて 245件/30日 の gmail が 'email' 記録されていた） ---
        auth_method: 'google',
        auth_display_name: authDisplayName,
        auth_provider_id: voterClerkUserId,
        channel: voteData.channel || 'unknown',
        created_at: createdAt,
        proof_hash: proofHash,
        prev_hash: prevHash,
        proof_nonce: nonce,
        // --- Phase 1 Step 2/3（display_mode は pro なら pro_link 自動） ---
        // NULL = 同意 UI 未操作。NO 押下時は VoteConsentSection 側で 'hidden' に UPDATE される。
        display_mode: voterProfessionalId ? 'pro_link' : null,
        client_photo_url: clientPhotoUrl,
        voter_professional_id: voterProfessionalId,
      })
      .select()
      .maybeSingle()

    if (voteError) {
      console.error('[vote-auth/google/callback] Vote INSERT error:', voteError)
      if (voteError.code === '23505') {
        // レースコンディション（ほぼ同時の二重送信）対策
        console.error('[vote-auth/google/callback] Duplicate vote (race condition)')
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

    // Step 9c: 投票者のロール判定（Phase 1 Step 2 で checkVoterIsPro に一本化）
    const voterIsPro = !!voterProfessionalId

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
