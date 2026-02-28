// src/app/api/auth/line/callback/route.ts
// Fix 8: パスワードを完全排除。generateLink + verifyOtp 方式。
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decryptState, exchangeCodeForToken, getLineProfile, extractEmailFromIdToken } from '@/lib/line-auth';

export const dynamic = 'force-dynamic'

// Supabase Admin Client（サーバーサイド専用・遅延初期化）
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // ユーザーがキャンセルした場合
  if (error) {
    return NextResponse.redirect(new URL('/login?error=line_cancelled', request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/login?error=line_missing_params', request.url));
  }

  try {
    // 1. State を復号して context を取得
    const context = decryptState(state);

    // State の有効期限チェック（10分）
    if (Date.now() - context.ts > 10 * 60 * 1000) {
      return NextResponse.redirect(new URL('/login?error=line_expired', request.url));
    }

    // 2. Authorization code → Access token
    const tokenData = await exchangeCodeForToken(code, false);

    // 3. LINE Profile取得
    const profile = await getLineProfile(tokenData.access_token);
    const lineEmail = extractEmailFromIdToken(tokenData.id_token);

    console.log('=== LINE Auth Debug (Fix 8: OTP方式) ===');

    // 4. 既存のLINE連携を確認
    const { data: existingMapping } = await supabaseAdmin
      .from('line_auth_mappings')
      .select('*')
      .eq('line_user_id', profile.userId)
      .maybeSingle();

    let supabaseUid: string;
    const email = lineEmail || `line_${profile.userId}@line.realproof.jp`;

    // 既存マッピングがある場合、ユーザーの存在を確認
    let mappingValid = false;
    if (existingMapping?.supabase_uid) {
      const { data: checkUser, error: checkError } = await supabaseAdmin.auth.admin.getUserById(existingMapping.supabase_uid);
      if (checkUser?.user && !checkError) {
        // ---- 既存ユーザー確認済み: ログイン ----
        supabaseUid = existingMapping.supabase_uid;
        mappingValid = true;
        console.log('[line/callback] existing user verified:', supabaseUid);

        // LINE情報を更新
        await supabaseAdmin.from('line_auth_mappings').update({
          line_display_name: profile.displayName,
          line_picture_url: profile.pictureUrl,
          line_email: lineEmail,
          updated_at: new Date().toISOString(),
        }).eq('line_user_id', profile.userId);
      } else {
        // ユーザーが存在しない → マッピングを削除して新規作成へ
        console.log('[line/callback] mapping points to deleted user:', existingMapping.supabase_uid, '→ cleaning up');
        await supabaseAdmin.from('line_auth_mappings').delete().eq('line_user_id', profile.userId);
      }
    }

    if (!mappingValid) {
      // ---- 新規ユーザー: 登録 ----
      // パスワードはダミー（使わないがcreateUserに必須）
      const dummyPassword = crypto.randomUUID();
      const { data: newUser, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: dummyPassword,
        email_confirm: true,
        user_metadata: {
          line_user_id: profile.userId,
          display_name: profile.displayName,
          avatar_url: profile.pictureUrl,
        },
      });

      if (signUpError || !newUser?.user) {
        if (signUpError?.code === 'email_exists') {
          // メールが既に存在 → generateLink で ID を取得
          console.log('[line/callback] email_exists, using generateLink to get user:', email);
          const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: email,
          });
          if (linkData?.user?.id) {
            supabaseUid = linkData.user.id;
            console.log('[line/callback] found user via generateLink:', supabaseUid);
          } else {
            console.error('[line/callback] generateLink could not find user for:', email);
            return NextResponse.redirect(new URL('/login?error=line_signup_failed', request.url));
          }
        } else {
          console.error('Supabase user creation failed:', signUpError);
          return NextResponse.redirect(new URL('/login?error=line_signup_failed', request.url));
        }
      } else {
        supabaseUid = newUser.user.id;
      }

      // professionals テーブルに初期レコード作成（pro_register の場合）
      if (context.type === 'pro_register') {
        await supabaseAdmin.from('professionals').upsert({
          user_id: supabaseUid,
          display_name: profile.displayName,
          avatar_url: profile.pictureUrl || null,
          line_user_id: profile.userId,
          line_display_name: profile.displayName,
        }, { onConflict: 'user_id' });
      }

      // clients テーブルに初期レコード作成（client_login の場合）
      if (context.type === 'client_login') {
        await supabaseAdmin.from('clients').upsert({
          user_id: supabaseUid,
          nickname: profile.displayName,
        }, { onConflict: 'user_id' });
      }

      // LINE連携マッピングを保存
      await supabaseAdmin.from('line_auth_mappings').upsert({
        line_user_id: profile.userId,
        line_display_name: profile.displayName,
        line_email: lineEmail,
        line_picture_url: profile.pictureUrl,
        supabase_uid: supabaseUid,
      }, { onConflict: 'line_user_id' });
    }

    // === Fix 8.1: サーバー側 action_link 消費方式 ===
    // generateLink → action_link をサーバーがfetch → セッショントークン取得 → クライアントに渡す
    // updateUserById を一切呼ばない。verifyOtp もクライアントで呼ばない。
    console.log('[line/callback] Fix 8.1: generating magic link for:', email);

    const redirectPath = context.type === 'client_login' ? '/mycard' : '/dashboard';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin;

    const { data: magicLinkData, error: magicLinkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
    });

    if (magicLinkError || !magicLinkData?.properties?.action_link) {
      console.error('[line/callback] CRITICAL: generateLink failed:', magicLinkError?.message);
      return NextResponse.redirect(new URL('/login?error=line_signin_failed', request.url));
    }

    const actionLink = magicLinkData.properties.action_link;
    console.log('[line/callback] action_link generated, consuming server-side...');

    // action_link をサーバー側でGETして消費（ブラウザがメールのリンクをクリックするのと同じ）
    // redirect: 'manual' でリダイレクトをキャッチ
    try {
      const verifyResponse = await fetch(actionLink, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'REALPROOF-Server/1.0',
        },
      });

      const locationHeader = verifyResponse.headers.get('location');
      console.log('[line/callback] verify response status:', verifyResponse.status);
      console.log('[line/callback] location header present:', !!locationHeader);

      if (locationHeader) {
        // Supabase はリダイレクト先にセッション情報を含める
        // PKCE: ?code=xxx  /  Implicit: #access_token=xxx&refresh_token=xxx
        const redirectUrl = new URL(locationHeader);

        // PKCE mode: code パラメータ
        const pkceCode = redirectUrl.searchParams.get('code');
        if (pkceCode) {
          console.log('[line/callback] PKCE code received, passing to client');
          const params = new URLSearchParams({
            code: pkceCode,
            redirect: redirectPath,
            mode: 'pkce',
          });
          return NextResponse.redirect(
            new URL(`/auth/line-session?${params.toString()}`, request.url)
          );
        }

        // Implicit mode: hash fragment にトークン
        const fragment = redirectUrl.hash;
        if (fragment && fragment.includes('access_token')) {
          console.log('[line/callback] implicit flow tokens received');
          // hash fragment ごとクライアントに転送
          return NextResponse.redirect(
            new URL(`/auth/line-session?redirect=${encodeURIComponent(redirectPath)}&mode=implicit${fragment}`, request.url)
          );
        }

        // どちらでもない場合 — エラーパラメータをチェック
        const errorParam = redirectUrl.searchParams.get('error');
        const errorDescription = redirectUrl.searchParams.get('error_description');
        if (errorParam) {
          console.error('[line/callback] verify redirect contained error:', errorParam, errorDescription);
          return NextResponse.redirect(new URL('/login?error=line_signin_failed', request.url));
        }

        // redirect先にトークン情報がない場合 → redirect先のURL全体をクライアントに渡す
        console.log('[line/callback] no tokens in redirect, forwarding full location');
        console.log('[line/callback] location:', locationHeader);

        // フォールバック: action_link のリダイレクト先をそのままクライアントに
        return NextResponse.redirect(locationHeader);
      }

      // リダイレクトなしの場合 → JSON レスポンスかもしれない
      if (verifyResponse.ok) {
        const body = await verifyResponse.json().catch(() => null);
        if (body?.access_token && body?.refresh_token) {
          console.log('[line/callback] JSON response with tokens');
          const params = new URLSearchParams({
            access_token: body.access_token,
            refresh_token: body.refresh_token,
            redirect: redirectPath,
            mode: 'direct',
          });
          return NextResponse.redirect(
            new URL(`/auth/line-session?${params.toString()}`, request.url)
          );
        }
      }

      console.error('[line/callback] unexpected verify response:', verifyResponse.status);
      return NextResponse.redirect(new URL('/login?error=line_signin_failed', request.url));

    } catch (fetchErr) {
      console.error('[line/callback] action_link fetch error:', fetchErr);
      return NextResponse.redirect(new URL('/login?error=line_signin_failed', request.url));
    }

  } catch (err) {
    console.error('LINE callback error:', err);

    // 二重コールバック対策: invalid_grant は並列リクエストの片方が成功している可能性が高い
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('invalid_grant') || errMsg.includes('invalid authorization code')) {
      console.log('[line/callback] invalid_grant detected (likely duplicate callback), redirecting to dashboard');
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.redirect(new URL('/login?error=line_callback_failed', request.url));
  }
}
