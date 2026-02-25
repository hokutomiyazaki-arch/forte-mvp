// src/app/api/auth/line/vote-callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decryptState, exchangeCodeForToken, getLineProfile, extractEmailFromIdToken } from '@/lib/line-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    // ユーザーがキャンセル → 投票画面に戻す
    try {
      const context = decryptState(state || '');
      if (context.type === 'vote') {
        return NextResponse.redirect(new URL(`/vote/${context.professional_id}?token=${context.qr_token}&error=line_cancelled`, request.url));
      }
    } catch { /* state decode failed */ }
    return NextResponse.redirect(new URL('/?error=line_cancelled', request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/?error=line_missing_params', request.url));
  }

  try {
    // 1. State復号
    const context = decryptState(state);
    if (context.type !== 'vote') {
      return NextResponse.redirect(new URL('/login?error=invalid_context', request.url));
    }

    // State有効期限チェック（10分）
    if (Date.now() - context.ts > 10 * 60 * 1000) {
      return NextResponse.redirect(new URL(`/vote/${context.professional_id}?token=${context.qr_token}&error=line_expired`, request.url));
    }

    // 2. Token取得
    const tokenData = await exchangeCodeForToken(code, true);

    // 3. Profile取得
    const profile = await getLineProfile(tokenData.access_token);
    const lineEmail = extractEmailFromIdToken(tokenData.id_token);

    // 4. 重複投票チェック（LINE userId で）
    const { data: existingVote } = await supabaseAdmin
      .from('votes')
      .select('id')
      .eq('auth_provider_id', profile.userId)
      .eq('auth_method', 'line')
      .eq('professional_id', context.professional_id)
      .maybeSingle();

    if (existingVote) {
      return NextResponse.redirect(
        new URL(`/vote/${context.professional_id}?token=${context.qr_token}&error=already_voted`, request.url)
      );
    }

    // メールでも重複チェック（LINEからメール取得できた場合）
    if (lineEmail) {
      const { data: emailVote } = await supabaseAdmin
        .from('votes')
        .select('id')
        .eq('voter_email', lineEmail)
        .eq('professional_id', context.professional_id)
        .maybeSingle();

      if (emailVote) {
        return NextResponse.redirect(
          new URL(`/vote/${context.professional_id}?token=${context.qr_token}&error=already_voted`, request.url)
        );
      }
    }

    // 5. セルフ投票チェック
    const { data: pro } = await supabaseAdmin
      .from('professionals')
      .select('line_user_id, user_id')
      .eq('id', context.professional_id)
      .maybeSingle();

    if (pro?.line_user_id === profile.userId) {
      return NextResponse.redirect(
        new URL(`/vote/${context.professional_id}?token=${context.qr_token}&error=self_vote`, request.url)
      );
    }

    // 6. stateから投票データを取得して直接DBに保存
    const voteData = context.vote_data;
    const voter_email = lineEmail || `line_${profile.userId}@line.realproof.jp`;

    const { data: insertedVote, error: voteError } = await supabaseAdmin
      .from('votes')
      .insert({
        professional_id: context.professional_id,
        voter_email: voter_email,
        client_user_id: null,
        session_count: voteData.session_count || 'first',
        vote_type: voteData.vote_type || 'proof',
        selected_proof_ids: voteData.selected_proof_ids || null,
        selected_personality_ids: voteData.selected_personality_ids || null,
        selected_reward_id: voteData.selected_reward_id || null,
        comment: voteData.comment || null,
        qr_token: context.qr_token || null,
        status: 'confirmed',
        auth_method: 'line',
        auth_provider_id: profile.userId,
        auth_display_name: profile.displayName,
      })
      .select()
      .maybeSingle();

    if (voteError) {
      console.error('Vote insert error:', voteError);
      const errorType = voteError.code === '23505' ? 'already_voted' : 'vote_save_failed';
      return NextResponse.redirect(
        new URL(`/vote/${context.professional_id}?token=${context.qr_token}&error=${errorType}`, request.url)
      );
    }

    // リワード選択がある場合、client_rewardsに保存
    if (voteData.selected_reward_id && insertedVote) {
      await supabaseAdmin.from('client_rewards').insert({
        vote_id: insertedVote.id,
        reward_id: voteData.selected_reward_id,
        professional_id: context.professional_id,
        client_email: voter_email,
        status: 'pending',
      });
    }

    // vote_emails にメアドを保存（分析用）
    if (lineEmail) {
      await supabaseAdmin.from('vote_emails').insert({
        email: lineEmail,
        professional_id: context.professional_id,
        source: 'vote',
      }); // 重複エラーは無視（insertはエラーを返すだけで例外にならない）
    }

    // 投票完了ページへリダイレクト
    const hasReward = voteData.selected_reward_id ? '1' : '0';
    return NextResponse.redirect(
      new URL(`/vote-confirmed?proId=${context.professional_id}&reward=${hasReward}`, request.url)
    );

  } catch (err) {
    console.error('LINE vote callback error:', err);
    return NextResponse.redirect(new URL('/?error=line_vote_failed', request.url));
  }
}
