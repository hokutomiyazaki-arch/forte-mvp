import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { normalizeEmail } from '@/lib/normalize-email'
import { computeProofHash, generateNonce, GENESIS_HASH } from '@/lib/proof-chain'
import { checkVoterIsPro } from '@/lib/voter-pro-check'
import { checkVoteDuplicates } from '@/lib/vote-duplicate-check'
import { markTokenUsed } from '@/lib/qr-token'
import { checkProCooldown, PRO_COOLDOWN_MESSAGE } from '@/lib/vote-cooldown'


export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { email, code, professional_id, vote_data } = await req.json()

    if (!email || !code || !professional_id || !vote_data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // 確認コードの検証
    const { data: confirmation, error: confirmError } = await supabase
      .from('vote_confirmations')
      .select('*')
      .eq('email', email)
      .eq('professional_id', professional_id)
      .eq('token', code)
      .is('confirmed_at', null)
      .maybeSingle()

    if (confirmError || !confirmation) {
      console.error('[verify-code] Invalid code:', { email, code, professional_id })
      return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
    }

    // 有効期限チェック
    if (confirmation.expires_at && new Date(confirmation.expires_at) < new Date()) {
      return NextResponse.json({ error: 'expired_code' }, { status: 400 })
    }

    // 確認完了マーク
    await supabase
      .from('vote_confirmations')
      .update({ confirmed_at: new Date().toISOString() })
      .eq('id', confirmation.id)

    // ── 重複チェック（7日リピート / 30分クールダウン / 1分ダブルサブミット） ──
    const dupeResult = await checkVoteDuplicates(supabase, {
      voterIdentifier: email,
      professionalId: professional_id,
    })
    if (!dupeResult.ok) {
      if (dupeResult.reason === 'duplicate_submit' && dupeResult.existingVoteId) {
        // ダブルサブミット検出 — エラーではなく成功扱い
        console.log('[verify-code] Double submit detected:', normalizeEmail(email), professional_id)
        return NextResponse.json({
          success: true,
          vote_id: dupeResult.existingVoteId,
          client_reward_id: '',
        })
      }
      // Phase 1b: context 情報も返してクライアント側で getVoteErrorMessage() が
      //           次回日付や残り分数を表示できるようにする
      if (dupeResult.reason === 'cooldown') {
        return NextResponse.json({
          error: 'cooldown',
          recentVoteCreatedAt: dupeResult.recentVoteCreatedAt,
          cooldownRemainingMinutes: dupeResult.cooldownRemainingMinutes,
        }, { status: 429 })
      }
      return NextResponse.json({
        error: 'already_voted',
        recentVoteCreatedAt: dupeResult.recentVoteCreatedAt,
      }, { status: 409 })
    }

    // ── QRトークン検証（未使用 + 未失効） — Set 1 Phase 3 ──
    if (vote_data.qr_token) {
      const { data: tokenData } = await supabase
        .from('qr_tokens')
        .select('id, professional_id, expires_at, used_at')
        .eq('token', vote_data.qr_token)
        .gt('expires_at', new Date().toISOString())
        .is('used_at', null)
        .maybeSingle()

      if (!tokenData) {
        console.error('[verify-code] Invalid QR token:', vote_data.qr_token)
        return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
      }
    }

    // ── プロ単位30分クールダウン（Set 2） ──
    const proCooldown = await checkProCooldown(professional_id)
    if (proCooldown.blocked) {
      return NextResponse.json(
        {
          success: false,
          error: 'PRO_COOLDOWN',
          message: PRO_COOLDOWN_MESSAGE,
          remainingMin: proCooldown.remainingMin,
        },
        {
          status: 429,
          headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        }
      )
    }

    // --- ハッシュチェーン処理 START ---
    const { data: latestVote } = await supabase
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
      professional_id: professional_id,
      vote_type: vote_data.vote_type || 'proof',
      selected_proof_ids: vote_data.selected_proof_ids || null,
      comment: vote_data.comment || null,
      created_at: createdAt,
      nonce: nonce,
      prev_hash: prevHash,
    })
    // --- ハッシュチェーン処理 END ---

    // --- Phase 1 Step 2: メール認証は画像なし、プロ判定のみ ---
    const voterProfessionalId = await checkVoterIsPro(
      normalizeEmail(email),
      null
    )

    // 投票をINSERT（status=confirmed で直接保存）
    const { data: insertedVote, error: voteError } = await supabase
      .from('votes')
      .insert({
        professional_id: professional_id,
        voter_email: email,
        normalized_email: normalizeEmail(email),
        client_user_id: null,
        vote_type: vote_data.vote_type || 'proof',
        vote_weight: 1.0,
        selected_proof_ids: vote_data.selected_proof_ids || null,
        selected_personality_ids: vote_data.selected_personality_ids || null,
        selected_reward_id: vote_data.selected_reward_id || null,
        comment: vote_data.comment || null,
        qr_token: vote_data.qr_token || null,
        status: 'confirmed',
        auth_method: 'email_code',
        channel: vote_data.channel || 'unknown',
        created_at: createdAt,
        proof_hash: proofHash,
        prev_hash: prevHash,
        proof_nonce: nonce,
        // --- Phase 1 Step 3: Clerk セッション非経由なので両方 null ---
        auth_display_name: null,
        auth_provider_id: null,
        // Email は公開要素ゼロ → 同意 UI スキップのため初期値 'hidden'
        display_mode: voterProfessionalId ? 'pro_link' : 'hidden',
        client_photo_url: null,
        voter_professional_id: voterProfessionalId,
      })
      .select()
      .maybeSingle()

    if (voteError) {
      console.error('[verify-code] Vote insert error:', voteError)
      if (voteError.code === '23505') {
        // レースコンディション（ほぼ同時の二重送信）対策
        console.error('[verify-code] Duplicate vote (race condition)')
        return NextResponse.json({ error: 'already_voted' }, { status: 409 })
      }
      return NextResponse.json({ error: 'vote_failed' }, { status: 500 })
    }

    if (!insertedVote) {
      return NextResponse.json({ error: 'vote_failed' }, { status: 500 })
    }

    await markTokenUsed(vote_data.qr_token || '')

    // vote_confirmationsにvote_idを紐付け
    await supabase
      .from('vote_confirmations')
      .update({ vote_id: insertedVote.id })
      .eq('id', confirmation.id)

    // vote_emails にメアドを保存（分析用）
    try {
      await supabase.from('vote_emails').insert({
        email: email,
        professional_id: professional_id,
        source: 'vote',
      })
    } catch {
      // 失敗しても投票には影響しない
    }

    // リワード保存
    let clientRewardId = ''
    if (vote_data.selected_reward_id && insertedVote) {
      const { data: crData } = await supabase
        .from('client_rewards')
        .insert({
          vote_id: insertedVote.id,
          reward_id: vote_data.selected_reward_id,
          professional_id: professional_id,
          client_email: email,
          status: 'active',
        })
        .select('id')
        .maybeSingle()
      if (crData?.id) clientRewardId = crData.id
    }

    console.log('[verify-code] Vote confirmed:', insertedVote.id, 'for pro:', professional_id)
    return NextResponse.json({
      success: true,
      vote_id: insertedVote.id,
      client_reward_id: clientRewardId,
    })
  } catch (err) {
    console.error('[verify-code] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
