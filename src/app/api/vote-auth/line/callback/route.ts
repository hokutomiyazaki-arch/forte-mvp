import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clerkClient } from '@clerk/nextjs/server'

import { normalizeEmail } from '@/lib/normalize-email'
import { computeProofHash, generateNonce, GENESIS_HASH } from '@/lib/proof-chain'
import { checkVoterIsPro } from '@/lib/voter-pro-check'
import { checkVoteDuplicates } from '@/lib/vote-duplicate-check'
import { claimLineCallback } from '@/lib/line-idempotency'
import { markTokenUsed } from '@/lib/qr-token'
import { checkProCooldown } from '@/lib/vote-cooldown'

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

  // LINE認証がキャンセルされた場合
  if (error || !code || !stateParam) {
    console.error('[vote-auth/line/callback] Auth error or cancelled:', error)
    // state からprofessional_idを復元してエラーパラメータ付きで投票ページに戻す
    let redirectPath = '/'
    if (stateParam) {
      try {
        const stateData = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
        const tokenParam = stateData.qr_token ? `?token=${stateData.qr_token}&error=line_cancelled` : '?error=line_cancelled'
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
    console.error('[vote-auth/line/callback] Invalid state parameter')
    return NextResponse.redirect(new URL('/?error=invalid_state', origin))
  }

  const { professional_id, qr_token, vote_data: vote_data_str } = stateData
  const votePageUrl = `/vote/${professional_id}${qr_token ? `?token=${qr_token}` : ''}`

  try {
    // Step 1: code → access_token + id_token
    const channelId = process.env.LINE_CHANNEL_ID!
    const channelSecret = process.env.LINE_CHANNEL_SECRET!
    const redirectUri = `${origin}/api/vote-auth/line/callback`

    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    })

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      console.error('[vote-auth/line/callback] Token exchange failed:', tokenRes.status, errBody)

      // invalid_grant = codeが既に使用済み → 1回目のcallbackで処理済みの可能性
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
            console.log('[vote-auth/line/callback] invalid_grant but vote exists, redirecting to vote-confirmed')
            return NextResponse.redirect(
              new URL(`/vote-confirmed?pro=${professional_id}&vote_id=${existingVote.id}&auth_method=line`, origin)
            )
          }
        } catch (e) {
          console.error('[vote-auth/line/callback] Recovery check failed:', e)
        }

        // 1回目 callback が pro_cooldown でブロックされていた可能性を救済
        // （Set 2 Phase 4）: existingVote 無し + LINE 二重発火で 1回目の
        // ?error=pro_cooldown が 2回目の line_retry に上書きされる問題への対策。
        try {
          const proCooldown = await checkProCooldown(professional_id)
          if (proCooldown.blocked) {
            const errUrl = new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=pro_cooldown`, origin)
            if (proCooldown.remainingMin) {
              errUrl.searchParams.set('remaining', String(proCooldown.remainingMin))
            }
            console.log('[vote-auth/line/callback] invalid_grant + pro_cooldown re-detected, redirecting with proper error')
            return NextResponse.redirect(errUrl)
          }
        } catch (e) {
          console.error('[vote-auth/line/callback] pro_cooldown re-check failed:', e)
        }

        // invalid_grant で最近の vote が見つからない場合、1回目 callback の
        // 失敗理由（cooldown / already_voted / self_vote / etc.）をこの時点で
        // 特定する手段がない（email/userId は token 交換失敗により取れない）。
        // 以前は `already_voted` に固定で倒していたが、本来 cooldown だった
        // ケースまで「既にご投票いただいております」と誤表示されるため、
        // 汎用リトライエラー `line_retry` にフォールバックし、もう一度 LINE
        // 認証を促す。fresh な code で再試行すれば Step 4 の checkVoteDuplicates
        // が正確な reason を返す。
        console.log('[vote-auth/line/callback] invalid_grant without recent vote — falling back to line_retry (reason unknown)')
        return NextResponse.redirect(new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=line_retry`, origin))
      }

      return NextResponse.redirect(new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=line_expired`, origin))
    }

    const tokenData = await tokenRes.json()
    console.log('[vote-auth/line/callback] Token exchange OK')

    // Step 2: メールアドレス取得（id_tokenからデコード）
    let email = ''

    if (tokenData.id_token) {
      try {
        // JWT の payload 部分をデコード（署名検証は省略、MVPのため）
        const payload = JSON.parse(
          Buffer.from(tokenData.id_token.split('.')[1], 'base64').toString()
        )
        email = payload.email || ''
        console.log('[vote-auth/line/callback] Email from id_token:', email ? 'found' : 'not found')
      } catch (e) {
        console.error('[vote-auth/line/callback] Failed to decode id_token:', e)
      }
    }

    // --- Phase 1 Step 2: LINE profile を常に取得（pictureUrl / displayName / userIdフォールバック用） ---
    let lineProfile: { userId?: string; displayName?: string; pictureUrl?: string } | null = null
    try {
      const profileRes = await fetch('https://api.line.me/v2/profile', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
      })
      if (profileRes.ok) {
        lineProfile = await profileRes.json()
      } else {
        console.error('[vote-auth/line/callback] LINE profile fetch returned non-OK:', profileRes.status)
      }
    } catch (e) {
      console.error('[vote-auth/line/callback] LINE profile fetch failed:', e)
    }

    // メールが取れない場合（email権限未承認）→ LINE userIdをフォールバック
    if (!email) {
      if (lineProfile?.userId) {
        email = `line_${lineProfile.userId}@line.realproof.jp`
        console.log('[vote-auth/line/callback] Using LINE userId as email fallback:', email)
      } else {
        console.error('[vote-auth/line/callback] Failed to get LINE profile userId')
        return NextResponse.redirect(
          new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=line_no_email`, origin)
        )
      }
    }

    email = email.trim().toLowerCase()

    // Step 3: 投票データをパース
    let voteData: any
    try {
      voteData = JSON.parse(decodeURIComponent(vote_data_str))
    } catch {
      console.error('[vote-auth/line/callback] Invalid vote_data')
      return NextResponse.redirect(new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=invalid_vote_data`, origin))
    }

    const supabaseAdmin = getSupabaseAdmin()

    // Step 3.5: LINE callback 冪等性 claim（二重発火対策）
    //   LINE 内蔵ブラウザの既知挙動で callback が 2 回発火すると、
    //   checkVoteDuplicates → INSERT 間の race で 0.04 秒差の二重投票が発生する。
    //   DB UNIQUE 制約で 5 秒ウィンドウを serialize することで防止する。
    if (lineProfile?.userId) {
      const claim = await claimLineCallback(supabaseAdmin, lineProfile.userId, professional_id)
      if (!claim.acquired) {
        console.log('[vote-auth/line/callback] Claim rejected — duplicate callback detected:', lineProfile.userId, professional_id)
        if (claim.existingVoteId) {
          return NextResponse.redirect(
            new URL(`/vote-confirmed?pro=${professional_id}&vote_id=${claim.existingVoteId}&auth_method=line`, origin)
          )
        }
        // 先行 callback が INSERT 前の可能性あり — 短く待って再検索
        await new Promise(resolve => setTimeout(resolve, 1500))
        const { data: retryVote } = await supabaseAdmin
          .from('votes')
          .select('id')
          .eq('auth_provider_id', lineProfile.userId)
          .eq('professional_id', professional_id)
          .eq('auth_method', 'line')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (retryVote) {
          return NextResponse.redirect(
            new URL(`/vote-confirmed?pro=${professional_id}&vote_id=${retryVote.id}&auth_method=line`, origin)
          )
        }
        // ここまで来たら先行 callback は失敗した可能性 — 通常フローに進む（fail-open）
        console.warn('[vote-auth/line/callback] Claim rejected but no existing vote found after retry — falling through')
      }
    }

    // Step 4: 重複チェック（7日リピート / 30分クールダウン / 1分ダブルサブミット）
    const dupeResult = await checkVoteDuplicates(supabaseAdmin, {
      voterIdentifier: email,
      professionalId: professional_id,
    })
    if (!dupeResult.ok) {
      if (dupeResult.reason === 'duplicate_submit' && dupeResult.existingVoteId) {
        // ダブルサブミット検出 — エラーではなく成功扱い
        console.log('[vote-auth/line/callback] Double submit detected:', normalizeEmail(email), professional_id)
        return NextResponse.redirect(
          new URL(`/vote-confirmed?pro=${professional_id}&vote_id=${dupeResult.existingVoteId}&auth_method=line`, origin)
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

    // Step 5: 自己投票チェック（強化版）
    const { data: proData } = await supabaseAdmin
      .from('professionals')
      .select('user_id, contact_email')
      .eq('id', professional_id)
      .maybeSingle()

    if (proData) {
      let isSelfVote = false

      // Check 1: professionals.contact_email と一致
      if (proData.contact_email && proData.contact_email.toLowerCase() === email) {
        isSelfVote = true
      }

      // Check 2: professionals.contact_email と一致（重複チェック）
      if (!isSelfVote && proData.contact_email && proData.contact_email.toLowerCase() === email) {
        isSelfVote = true
      }

      // Check 3: Clerk経由でプロの全メールアドレスと照合
      if (!isSelfVote && proData.user_id) {
        try {
          const clerk = await clerkClient()
          const clerkUser = await clerk.users.getUser(proData.user_id)
          const proEmails = clerkUser.emailAddresses.map(e => e.emailAddress.toLowerCase())
          if (proEmails.includes(email)) {
            isSelfVote = true
          }
        } catch (e) {
          console.error('[vote-auth/line/callback] Clerk self-vote check failed:', e)
        }
      }

      // Check 4: clientsテーブルのuser_id照合（フォールバック）
      if (!isSelfVote && proData.user_id) {
        const { data: clientData } = await supabaseAdmin
          .from('clients')
          .select('user_id')
          .eq('email', email)
          .maybeSingle()

        if (clientData?.user_id === proData.user_id) {
          isSelfVote = true
        }
      }

      if (isSelfVote) {
        return NextResponse.redirect(
          new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=self_vote`, origin)
        )
      }
    }

    // Step 6: （重複/クールダウンチェックは Step 4 の checkVoteDuplicates で統一済み）

    // Step 6.5: QRトークン検証（未使用 + 未失効） — Set 1 Phase 3
    if (qr_token) {
      const { data: tokenData } = await supabaseAdmin
        .from('qr_tokens')
        .select('id, professional_id, expires_at, used_at')
        .eq('token', qr_token)
        .gt('expires_at', new Date().toISOString())
        .is('used_at', null)
        .maybeSingle()

      if (!tokenData) {
        console.error('[vote-auth/line/callback] Invalid QR token:', qr_token)
        return NextResponse.redirect(
          new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=invalid_token`, origin)
        )
      }
    }

    // Step 6.6: プロ単位30分クールダウン（Set 2）
    const proCooldown = await checkProCooldown(professional_id)
    if (proCooldown.blocked) {
      const errUrl = new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=pro_cooldown`, origin)
      if (proCooldown.remainingMin) {
        errUrl.searchParams.set('remaining', String(proCooldown.remainingMin))
      }
      return NextResponse.redirect(errUrl)
    }

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

    // --- Phase 1 Step 2: プロ判定（LINE は Clerk session なし、email のみで判定） ---
    const voterProfessionalId = await checkVoterIsPro(
      normalizeEmail(email),
      null
    )
    const clientPhotoUrl = lineProfile?.pictureUrl || null

    // Step 7: 投票INSERT（LINEで認証済みなので status='confirmed'）
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
        auth_method: 'line',
        status: 'confirmed',
        channel: voteData.channel || 'unknown',
        created_at: createdAt,
        proof_hash: proofHash,
        prev_hash: prevHash,
        proof_nonce: nonce,
        // --- Phase 1 Step 3 追加: auth_display_name / auth_provider_id ---
        auth_display_name: lineProfile?.displayName || null,
        auth_provider_id: lineProfile?.userId || null,
        // --- Phase 1 Step 2 追加（display_mode は pro なら pro_link 自動） ---
        // NULL = 同意 UI 未操作。NO 押下時は VoteConsentSection 側で 'hidden' に UPDATE される。
        display_mode: voterProfessionalId ? 'pro_link' : null,
        client_photo_url: clientPhotoUrl,
        voter_professional_id: voterProfessionalId,
      })
      .select()
      .maybeSingle()

    if (voteError) {
      console.error('[vote-auth/line/callback] Vote INSERT error:', voteError)
      if (voteError.code === '23505') {
        // レースコンディション（ほぼ同時の二重送信）対策
        console.error('[vote-auth/line/callback] Duplicate vote (race condition)')
        return NextResponse.redirect(
          new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=already_voted`, origin)
        )
      }
      return NextResponse.redirect(
        new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=vote_failed`, origin)
      )
    }

    console.log('[vote-auth/line/callback] Vote inserted:', insertedVote.id)

    await markTokenUsed(qr_token || '')

    // Step 8: vote_emails に記録
    try {
      await supabaseAdmin.from('vote_emails').insert({
        email,
        professional_id,
        source: 'line',
      })
    } catch {
      // vote_emails への記録は失敗しても投票自体には影響しない
    }

    // Step 9: リワード処理
    let lineRid = ''
    if (voteData.selected_reward_id) {
      const { data: crData, error: rewardError } = await supabaseAdmin.from('client_rewards').insert({
        vote_id: insertedVote.id,
        reward_id: voteData.selected_reward_id,
        professional_id,
        client_email: email,
        status: 'active',
      }).select('id').maybeSingle()
      if (rewardError) {
        console.error('[vote-auth/line/callback] client_rewards INSERT error:', rewardError)
      }
      if (crData?.id) lineRid = crData.id
    }

    // Step 9d: PROVEN/SPECIALIST通知チェック（15票/30票到達時のメール通知）
    try {
      const PROVEN_THRESHOLD = 15
      const SPECIALIST_THRESHOLD = 30
      const selectedProofIds: string[] = voteData.selected_proof_ids || []
      if (selectedProofIds.length > 0) {
        const { data: summary } = await supabaseAdmin
          .from('vote_summary')
          .select('*')
          .eq('professional_id', professional_id)

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
                console.log(`[vote-auth/line/callback] PROVEN email sent for ${categoryName}`)
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
                console.log(`[vote-auth/line/callback] SPECIALIST email sent for ${categoryName}`)
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
      console.error('[vote-auth/line/callback] PROVEN/SPECIALIST notification error:', err)
    }

    // Step 9c: Clerkアカウント存在チェック（ロール判定は Phase 1 Step 2 で checkVoterIsPro に一本化）
    let hasAccount = false
    try {
      const clerk = await clerkClient()
      const users = await clerk.users.getUserList({ emailAddress: [email] })
      hasAccount = users.data.length > 0
    } catch (e) {
      console.error('[vote-auth/line/callback] Clerk user check failed:', e)
    }
    const voterIsPro = !!voterProfessionalId

    // Step 10: vote-confirmed にリダイレクト
    const redirectParams = new URLSearchParams({
      pro: professional_id,
      vote_id: insertedVote.id,
      auth_method: 'line',
      has_account: hasAccount ? 'true' : 'false',
      role: voterIsPro ? 'pro' : 'client',
    })
    if (lineRid) redirectParams.set('rid', lineRid)

    console.log('[vote-auth/line/callback] Success! Redirecting to vote-confirmed')
    return NextResponse.redirect(
      new URL(`/vote-confirmed?${redirectParams.toString()}`, origin)
    )

  } catch (err) {
    console.error('[vote-auth/line/callback] Unexpected error:', err)
    return NextResponse.redirect(
      new URL(`${votePageUrl}${votePageUrl.includes('?') ? '&' : '?'}error=unexpected`, origin)
    )
  }
}
