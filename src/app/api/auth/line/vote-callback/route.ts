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

    // 6. 投票確認ページへリダイレクト
    // sessionStorageから投票データを取得してDBに保存する
    const confirmUrl = new URL(`/vote/${context.professional_id}/confirm`, request.url);
    confirmUrl.searchParams.set('auth_method', 'line');
    confirmUrl.searchParams.set('auth_provider_id', profile.userId);
    confirmUrl.searchParams.set('auth_display_name', profile.displayName);
    if (lineEmail) {
      confirmUrl.searchParams.set('client_email', lineEmail);
    }
    confirmUrl.searchParams.set('professional_id', context.professional_id);
    confirmUrl.searchParams.set('qr_token', context.qr_token);

    return NextResponse.redirect(confirmUrl);

  } catch (err) {
    console.error('LINE vote callback error:', err);
    return NextResponse.redirect(new URL('/?error=line_vote_failed', request.url));
  }
}
