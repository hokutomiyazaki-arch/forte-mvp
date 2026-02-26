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

    if (existingMapping?.supabase_uid) {
      // ---- 既存ユーザー: ログイン ----
      supabaseUid = existingMapping.supabase_uid;

      // LINE情報を更新
      await supabaseAdmin.from('line_auth_mappings').update({
        line_display_name: profile.displayName,
        line_picture_url: profile.pictureUrl,
        line_email: lineEmail,
        updated_at: new Date().toISOString(),
      }).eq('line_user_id', profile.userId);

    } else {
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
          console.error('Supabase user creation failed:', signUpError);
          return NextResponse.redirect(new URL('/login?error=line_signup_failed', request.url));
        }

        supabaseUid = newUser.user.id;

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

    // 5. generateLink でマジックリンクトークンを生成（signInWithPassword廃止）
    // メールアドレスは既に分かっている。getUserById で取り直す必要なし。
    let userEmail: string = '';
    if (existingMapping?.supabase_uid) {
      // 既存ユーザー: auth.users から取得、フォールバックあり
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(existingMapping.supabase_uid);
      userEmail = userData.user?.email || lineEmail || `line_${profile.userId}@line.realproof.jp`;
    } else {
      // 新規ユーザー: 作成時に使ったメールをそのまま使う
      userEmail = lineEmail || `line_${profile.userId}@line.realproof.jp`;
    }

    console.log('=== LINE Callback Debug ===');
    console.log('profile.userId:', profile.userId);
    console.log('lineEmail:', lineEmail);
    console.log('existingMapping:', existingMapping ? 'found' : 'not found');
    console.log('supabaseUid:', supabaseUid);
    console.log('userEmail for generateLink:', userEmail);

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
    });

    console.log('generateLink result:', linkError ? linkError.message : 'success');

    if (linkError || !linkData) {
      console.error('generateLink failed:', linkError);
      return NextResponse.redirect(new URL('/login?error=line_session_failed', request.url));
    }

    // ★ action_link に直接リダイレクト（Supabase正規フロー）
    const actionLink = linkData.properties?.action_link;
    if (!actionLink) {
      console.error('No action_link in generateLink response');
      console.log('linkData:', JSON.stringify(linkData));
      return NextResponse.redirect(new URL('/login?error=line_no_action_link', request.url));
    }

    console.log('action_link obtained:', actionLink.substring(0, 80) + '...');

    // 6. Supabase action_link に redirect_to を追加
    // Supabase が検証後に /auth/callback にリダイレクトし、セッションを自動作成する
    const redirectPath = context.type === 'client_login' ? '/mycard' : '/dashboard';
    const origin = new URL(request.url).origin;
    const redirectUrl = new URL(actionLink);
    redirectUrl.searchParams.set('redirect_to', `${origin}/auth/callback?redirect=${redirectPath}`);

    console.log('Redirecting to Supabase action_link');
    return NextResponse.redirect(redirectUrl.toString());

  } catch (err) {
    console.error('LINE callback error:', err);
    return NextResponse.redirect(new URL('/login?error=line_callback_failed', request.url));
  }
}
