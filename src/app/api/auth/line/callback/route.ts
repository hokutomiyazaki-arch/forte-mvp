// src/app/api/auth/line/callback/route.ts
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

    // 4. 既存のLINE連携を確認
    const { data: existingMapping } = await supabaseAdmin
      .from('line_auth_mappings')
      .select('*')
      .eq('line_user_id', profile.userId)
      .maybeSingle();

    let supabaseUid: string;
    const email = lineEmail || `line_${profile.userId}@line.realproof.jp`;
    const linePassword = `line_${profile.userId}_${process.env.LINE_CHANNEL_SECRET}`;

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

      // 新規Supabase Authユーザー作成
      const { data: newUser, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: linePassword,
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

    // --- パスワード設定 ---
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(supabaseUid, {
      password: linePassword,
      email_confirm: true,
    });

    if (updateError) {
      console.error('[line/callback] updateUserById failed:', updateError.message);
      // updateUserById が失敗した場合、ユーザーを削除して再作成
      console.log('[line/callback] deleting and recreating user');
      await supabaseAdmin.auth.admin.deleteUser(supabaseUid);
      await supabaseAdmin.from('line_auth_mappings').delete().eq('line_user_id', profile.userId);

      const { data: recreatedUser, error: recreateError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: linePassword,
        email_confirm: true,
      });

      if (recreateError || !recreatedUser?.user) {
        console.error('[line/callback] recreate failed:', recreateError?.message);
        return NextResponse.redirect(new URL('/login?error=line_signup_failed', request.url));
      }
      supabaseUid = recreatedUser.user.id;

      // マッピング再保存
      await supabaseAdmin.from('line_auth_mappings').upsert({
        line_user_id: profile.userId,
        line_display_name: profile.displayName,
        line_email: lineEmail,
        line_picture_url: profile.pictureUrl,
        supabase_uid: supabaseUid,
      }, { onConflict: 'line_user_id' });
    }

    // --- signInWithPassword でセッション取得 ---
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { data: signInData, error: signInError } = await supabaseAuth.auth.signInWithPassword({
      email: email,
      password: linePassword,
    });

    if (signInError || !signInData?.session) {
      console.error('[line/callback] signInWithPassword failed:', signInError?.message);
      return NextResponse.redirect(new URL('/login?error=line_signin_failed', request.url));
    }

    console.log('[line/callback] signInWithPassword success, session obtained');

    // --- トークンをクライアントに渡す ---
    const origin = new URL(request.url).origin;
    const redirectPath = context.type === 'client_login' ? '/mycard' : '/dashboard';

    const sessionUrl = new URL('/auth/line-session', origin);
    sessionUrl.searchParams.set('access_token', signInData.session.access_token);
    sessionUrl.searchParams.set('refresh_token', signInData.session.refresh_token);
    sessionUrl.searchParams.set('redirect', redirectPath);

    console.log('[line/callback] redirecting to line-session with tokens');
    return NextResponse.redirect(sessionUrl.toString());

  } catch (err) {
    console.error('LINE callback error:', err);
    return NextResponse.redirect(new URL('/login?error=line_callback_failed', request.url));
  }
}
