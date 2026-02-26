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

      // メールアドレスの決定（LINEから取得 or 仮メール生成）
      const email = lineEmail || `line_${profile.userId}@line.realproof.jp`;
      const password = crypto.randomUUID(); // ランダムパスワード（LINE認証では使わない）

      // メールで既存ユーザーを確認（Google/Email で既に登録済みの場合）
      let existingUserId: string | null = null;
      if (lineEmail) {
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        const userList = users?.users || [];
        const found = userList.find((u: any) => u.email === lineEmail);
        if (found) existingUserId = found.id;
      }

      if (existingUserId) {
        // 既存ユーザーにLINE連携を追加
        supabaseUid = existingUserId;
      } else {
        // 新規Supabase Authユーザー作成
        const { data: newUser, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
          email: email,
          password: password,
          email_confirm: true, // メール確認不要にする
          user_metadata: {
            line_user_id: profile.userId,
            display_name: profile.displayName,
            avatar_url: profile.pictureUrl,
          },
        });

        if (signUpError || !newUser.user) {
          if (signUpError?.code === 'email_exists') {
            // メールが既に存在 → そのユーザーを使う
            console.log('[line/callback] email already exists, finding user by email:', email);
            const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers();
            const existingUser = allUsers?.users?.find((u: any) => u.email === email);
            if (existingUser) {
              supabaseUid = existingUser.id;
              console.log('[line/callback] found existing user by email:', supabaseUid);
            } else {
              console.error('[line/callback] email_exists but user not found in listUsers');
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

    // 5. generateLink で action_link を取得し、redirect_to を書き換える
    const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(supabaseUid);
    let userEmail = userData?.user?.email;

    console.log('[line/callback] getUserById:', supabaseUid, 'email:', userEmail || 'NONE', 'error:', getUserError?.message || 'none');

    if (!userEmail) {
      userEmail = lineEmail || `line_${profile.userId}@line.realproof.jp`;
      console.log('[line/callback] fallback email:', userEmail);
    }

    const origin = new URL(request.url).origin;
    const redirectPath = context.type === 'client_login' ? '/mycard' : '/dashboard';

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
      options: {
        redirectTo: `${origin}/auth/callback?redirect=${encodeURIComponent(redirectPath)}`
      }
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('[line/callback] generateLink failed:', linkError?.message);
      await supabaseAdmin.from('line_auth_mappings').delete().eq('supabase_uid', supabaseUid);
      return NextResponse.redirect(new URL('/login?error=line_session_failed&retry=1', request.url));
    }

    console.log('[line/callback] generateLink success → redirecting to action_link');

    return NextResponse.redirect(linkData.properties.action_link);

  } catch (err) {
    console.error('LINE callback error:', err);
    return NextResponse.redirect(new URL('/login?error=line_callback_failed', request.url));
  }
}
