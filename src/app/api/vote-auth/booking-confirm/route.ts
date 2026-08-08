/**
 * POST /api/vote-auth/booking-confirm
 *
 * §16-44（CEO決定 2026-08-08、2回明言）: 予約経由の記録依頼トークンで来たクライアントは、
 * メールアドレス入力と6桁コード認証を完全にスキップする。予約時にメール・電話は取得済みで
 * 二度手間だから。voter の識別は referral_bookings.client_email / client_phone を使う
 * （このAPIはメールアドレスをリクエストボディで受け取らない）。
 *
 * 検証・INSERTロジックは src/app/api/vote-auth/verify-code/route.ts の骨格を踏襲する
 * （verify-code 自体は無改修）。差分:
 *   - 確認コード（vote_confirmations）は存在しない → その検証・更新は無し
 *   - QRトークン検証はこのAPIの入口検証を兼ねる（booking_id 必須・専用トークン）
 *   - 自己投票チェックを新規に追加（verify-code には無い。LINE/Google callback の
 *     contact_email 一致チェックと同等のものをここに実装）
 *   - 1日3プロ制限はverify-codeにも実装が無いため、このAPIでも新規追加しない
 *   - vote_emails への保存はメール取得時のみ（電話番号フォールバック時はスキップ。
 *     既存の SMS 認証パス(auth_method='sms')と同じ扱い）
 *
 * PII: client_email / client_phone / normalized はレスポンス・ログに一切出さない。
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { normalizeEmail } from '@/lib/normalize-email'
import { computeProofHash, generateNonce, GENESIS_HASH, normalizeTimestampForHash } from '@/lib/proof-chain'
import { checkVoterIsPro } from '@/lib/voter-pro-check'
import { checkVoteDuplicates } from '@/lib/vote-duplicate-check'
import { markTokenUsed } from '@/lib/qr-token'
import { checkProCooldown, PRO_COOLDOWN_MESSAGE } from '@/lib/vote-cooldown'
import { matchVoteComment } from '@/lib/keyword-matcher'
import { resolveContinuationVoteType } from '@/lib/vote-continuation'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { professional_id, qr_token, vote_data } = await req.json()

    if (!professional_id || !qr_token || !vote_data) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }

    // ── 入力検証（レビュー指摘・軽微3）: INSERT/ハッシュ計算に使う前にサニタイズする ──
    // vote_type: 'continuation' はサーバー側 resolveContinuationVoteType のみが決める再分類結果
    // なので、クライアント入力としては許容しない（ホワイトリスト外は 'proof' 扱い）。
    const ALLOWED_BASE_VOTE_TYPES = ['proof', 'personality_only', 'hopeful']
    const sanitizedBaseVoteType = ALLOWED_BASE_VOTE_TYPES.includes(vote_data.vote_type)
      ? vote_data.vote_type
      : 'proof'
    const sanitizedProofIds = Array.isArray(vote_data.selected_proof_ids) && vote_data.selected_proof_ids.length > 0
      ? vote_data.selected_proof_ids.slice(0, 3)
      : null
    const sanitizedComment = vote_data.comment ? String(vote_data.comment).slice(0, 100) : null
    const sanitizedChannel = vote_data.channel ? String(vote_data.channel).slice(0, 32) : 'booking'

    const supabase = getSupabaseAdmin()

    // ── 1. QRトークン検証（このAPI専用: booking_id 必須） ──
    const { data: tokenData } = await supabase
      .from('qr_tokens')
      .select('id, professional_id, booking_id, expires_at, used_at')
      .eq('token', qr_token)
      .gt('expires_at', new Date().toISOString())
      .is('used_at', null)
      .maybeSingle()

    if (!tokenData) {
      console.error('[booking-confirm] Invalid QR token')
      return NextResponse.json({ error: 'token_invalid' }, { status: 400 })
    }
    if (!tokenData.booking_id) {
      // 予約トークン専用API。通常のQR/オンライン投票トークンはここに来ない想定
      return NextResponse.json({ error: 'not_booking_token' }, { status: 400 })
    }
    if (tokenData.professional_id !== professional_id) {
      console.error('[booking-confirm] Token professional_id mismatch')
      return NextResponse.json({ error: 'token_invalid' }, { status: 400 })
    }

    // ── 2. referral_bookings から連絡先を取得 ──
    const { data: booking } = await supabase
      .from('referral_bookings')
      .select('client_email, client_phone')
      .eq('id', tokenData.booking_id)
      .maybeSingle()

    const clientEmail = (booking?.client_email || '').trim()
    const clientPhone = (booking?.client_phone || '').trim()
    if (!clientEmail && !clientPhone) {
      // 連絡先が取れない場合はフロント側で通常の認証ステップへフォールバックする
      return NextResponse.json({ error: 'no_contact' }, { status: 400 })
    }

    // ── 3. voter識別子（メール優先・無ければ電話番号） ──
    const voterEmail = clientEmail || clientPhone
    const normalized = normalizeEmail(voterEmail)

    // ── 4. 自己投票チェック ──
    const { data: receivingPro } = await supabase
      .from('professionals')
      .select('contact_email')
      .eq('id', professional_id)
      .maybeSingle()

    if (
      receivingPro?.contact_email &&
      normalizeEmail(receivingPro.contact_email) === normalized
    ) {
      return NextResponse.json({ error: 'self_vote' }, { status: 400 })
    }

    // verify-code と同等: 投票者がプロとして登録済みかどうか（voter_professional_id 用）
    const voterProfessionalId = await checkVoterIsPro(normalized, null)

    // ── 5. 重複チェック（7日リピート / 30分クールダウン / 1分ダブルサブミット） ──
    const dupeResult = await checkVoteDuplicates(supabase, {
      voterIdentifier: voterEmail,
      professionalId: professional_id,
    })
    if (!dupeResult.ok) {
      if (dupeResult.reason === 'duplicate_submit' && dupeResult.existingVoteId) {
        console.log('[booking-confirm] Double submit detected:', professional_id)
        return NextResponse.json({
          success: true,
          vote_id: dupeResult.existingVoteId,
          client_reward_id: '',
        })
      }
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

    // ── 6. プロ単位30分クールダウン（Set 2） ──
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

    // --- ハッシュチェーン処理 START（verify-code と同一方式） ---
    const createdAt = normalizeTimestampForHash(new Date().toISOString())
    const baseVoteType = sanitizedBaseVoteType

    const continuationResult = await resolveContinuationVoteType(supabase, {
      normalizedEmail: normalized,
      professionalId: professional_id,
      visitClaim: vote_data.visit_claim,
      baseVoteType,
    })
    const resolvedVoteType = continuationResult.voteType

    let prevHash: string | null = null
    let nonce: string | null = null
    let proofHash: string | null = null
    if (resolvedVoteType === 'proof') {
      const { data: latestVote } = await supabase
        .from('votes')
        .select('proof_hash')
        .eq('vote_type', 'proof')
        .not('proof_hash', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const resolvedPrev = latestVote?.proof_hash || GENESIS_HASH
      const newNonce = generateNonce()
      proofHash = computeProofHash({
        voter_email: normalized,
        professional_id: professional_id,
        vote_type: resolvedVoteType,
        selected_proof_ids: sanitizedProofIds,
        comment: sanitizedComment,
        created_at: createdAt,
        nonce: newNonce,
        prev_hash: resolvedPrev,
      })
      prevHash = resolvedPrev
      nonce = newNonce
    }
    // --- ハッシュチェーン処理 END ---

    // ── 7. 投票をINSERT ──
    const { data: insertedVote, error: voteError } = await supabase
      .from('votes')
      .insert({
        professional_id: professional_id,
        voter_email: voterEmail,
        normalized_email: normalized,
        client_user_id: null,
        vote_type: resolvedVoteType,
        vote_weight: 1.0,
        selected_proof_ids: sanitizedProofIds,
        selected_personality_ids: vote_data.selected_personality_ids || null,
        selected_reward_id: vote_data.selected_reward_id || null,
        comment: sanitizedComment,
        qr_token: qr_token,
        status: 'confirmed',
        auth_method: 'booking',
        channel: sanitizedChannel,
        created_at: createdAt,
        proof_hash: proofHash,
        prev_hash: prevHash,
        proof_nonce: nonce,
        auth_display_name: null,
        auth_provider_id: null,
        // 予約経由は名前・写真等の公開要素が無い → 同意UIスキップのため初期値 'hidden'
        display_mode: voterProfessionalId ? 'pro_link' : 'hidden',
        client_photo_url: null,
        voter_professional_id: voterProfessionalId,
        self_reported_repeat: continuationResult.selfReportedRepeat,
        continuation_theme: vote_data.continuation_theme || null,
      })
      .select()
      .maybeSingle()

    if (voteError) {
      console.error('[booking-confirm] Vote insert error:', voteError)
      if (voteError.code === '23505') {
        console.error('[booking-confirm] Duplicate vote (race condition)')
        return NextResponse.json({ error: 'already_voted' }, { status: 409 })
      }
      return NextResponse.json({ error: 'vote_failed' }, { status: 500 })
    }

    if (!insertedVote) {
      return NextResponse.json({ error: 'vote_failed' }, { status: 500 })
    }

    matchVoteComment(insertedVote.id).catch((err) =>
      console.error('[booking-confirm] keyword match error:', err)
    )

    await markTokenUsed(qr_token)

    // vote_emails にメアドを保存（分析用）— メールが取得できた場合のみ。
    // 電話番号フォールバック時は既存の SMS 認証パス(auth_method='sms')と同様に保存しない。
    if (clientEmail) {
      try {
        await supabase.from('vote_emails').insert({
          email: clientEmail,
          professional_id: professional_id,
          source: 'booking',
        })
      } catch {
        // 失敗しても投票には影響しない
      }
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
          client_email: voterEmail,
          status: 'active',
        })
        .select('id')
        .maybeSingle()
      if (crData?.id) clientRewardId = crData.id
    }

    console.log('[booking-confirm] Vote confirmed:', insertedVote.id, 'for pro:', professional_id)
    return NextResponse.json({
      success: true,
      vote_id: insertedVote.id,
      client_reward_id: clientRewardId,
    })
  } catch (err) {
    console.error('[booking-confirm] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
