import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { normalizeEmail } from '@/lib/normalize-email'
import { checkExpertBadges } from '@/lib/expert-badges'

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

    // ── 30分クールダウンチェック（全プロ横断） ──
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: recentVote } = await supabase
      .from('votes')
      .select('created_at')
      .eq('normalized_email', normalizeEmail(email))
      .eq('status', 'confirmed')
      .gt('created_at', thirtyMinAgo)
      .limit(1)
      .maybeSingle()

    if (recentVote) {
      return NextResponse.json({ error: 'cooldown' }, { status: 429 })
    }

    // 投票をINSERT（status=confirmed で直接保存）
    const { data: insertedVote, error: voteError } = await supabase
      .from('votes')
      .insert({
        professional_id: professional_id,
        voter_email: email,
        normalized_email: normalizeEmail(email),
        client_user_id: null,
        session_count: vote_data.session_count || 'first',
        vote_type: vote_data.vote_type || 'proof',
        vote_weight: vote_data.session_count === 'first' ? 0.5 : 1.0,
        selected_proof_ids: vote_data.selected_proof_ids || null,
        selected_personality_ids: vote_data.selected_personality_ids || null,
        selected_reward_id: vote_data.selected_reward_id || null,
        comment: vote_data.comment || null,
        qr_token: vote_data.qr_token || null,
        status: 'confirmed',
        auth_method: 'email_code',
      })
      .select()
      .maybeSingle()

    if (voteError) {
      console.error('[verify-code] Vote insert error:', voteError)
      if (voteError.code === '23505') {
        return NextResponse.json({ error: 'already_voted' }, { status: 409 })
      }
      return NextResponse.json({ error: 'vote_failed' }, { status: 500 })
    }

    if (!insertedVote) {
      return NextResponse.json({ error: 'vote_failed' }, { status: 500 })
    }

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

    // エキスパートバッジ自動チェック
    await checkExpertBadges(supabase, professional_id)

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
