// src/app/api/auth/line/vote-callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decryptState, exchangeCodeForToken, getLineProfile, extractEmailFromIdToken } from '@/lib/line-auth';

export const dynamic = 'force-dynamic'

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
    // LINE認証は本人確認済みなので status: 'active'（email確認不要）
    if (voteData.selected_reward_id && insertedVote) {
      await supabaseAdmin.from('client_rewards').insert({
        vote_id: insertedVote.id,
        reward_id: voteData.selected_reward_id,
        professional_id: context.professional_id,
        client_email: voter_email,
        status: 'active',
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

    // 7. リワード情報をサーバーサイドで取得（モバイルでRLS不要にするため）
    let rewardParam = '';
    if (voteData.selected_reward_id) {
      const { data: rewardData } = await supabaseAdmin
        .from('rewards')
        .select('reward_type, content, title')
        .eq('id', voteData.selected_reward_id)
        .maybeSingle();
      if (rewardData) {
        const rewardJson = JSON.stringify({
          reward_type: rewardData.reward_type || '',
          content: rewardData.content || '',
          title: rewardData.title || '',
        });
        // base64url エンコード
        rewardParam = Buffer.from(rewardJson).toString('base64url');
      }
    }

    // 8. クライアントセッションを作成（LINE投票後もログイン状態にする）
    const voteId = insertedVote?.id || '';
    let confirmPath = `/vote-confirmed?pro=${context.professional_id}&vote_id=${voteId}&auth_method=line`;
    if (rewardParam) {
      confirmPath += `&reward=${rewardParam}`;
    }

    console.log('[vote-callback] Step 8: session creation start, lineUserId:', profile.userId);

    // line_auth_mappings から既存ユーザーを確認
    const { data: existingMapping, error: mappingError } = await supabaseAdmin
      .from('line_auth_mappings')
      .select('supabase_uid')
      .eq('line_user_id', profile.userId)
      .maybeSingle();

    console.log('[vote-callback] existingMapping:', existingMapping?.supabase_uid || 'NONE', 'error:', mappingError?.message || 'none');

    let supabaseUid: string | null = null;

    if (existingMapping?.supabase_uid) {
      supabaseUid = existingMapping.supabase_uid;
      console.log('[vote-callback] existing user found:', supabaseUid);
      // LINE情報を更新
      await supabaseAdmin.from('line_auth_mappings').update({
        line_display_name: profile.displayName,
        line_picture_url: profile.pictureUrl,
        line_email: lineEmail,
        updated_at: new Date().toISOString(),
      }).eq('line_user_id', profile.userId);
    } else {
      // 新規クライアントユーザー作成
      const clientEmail = lineEmail || `line_${profile.userId}@line.realproof.jp`;
      console.log('[vote-callback] creating new user, email:', clientEmail);

      // メールで既存ユーザーを確認
      let existingUserId: string | null = null;
      if (lineEmail) {
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        const userList = users?.users || [];
        const found = userList.find((u: any) => u.email === lineEmail);
        if (found) {
          existingUserId = found.id;
          console.log('[vote-callback] found existing user by email:', existingUserId);
        }
      }

      if (existingUserId) {
        supabaseUid = existingUserId;
      } else {
        const clientPassword = crypto.randomUUID();
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: clientEmail,
          password: clientPassword,
          email_confirm: true,
          user_metadata: {
            line_user_id: profile.userId,
            display_name: profile.displayName,
            avatar_url: profile.pictureUrl,
          },
        });
        if (!createError && newUser.user) {
          supabaseUid = newUser.user.id;
          console.log('[vote-callback] new user created:', supabaseUid);
        } else {
          console.error('[vote-callback] user creation FAILED:', createError?.message);
        }
      }

      if (supabaseUid) {
        // clients テーブルに保存
        await supabaseAdmin.from('clients').upsert({
          user_id: supabaseUid,
          nickname: profile.displayName,
        }, { onConflict: 'user_id' });

        // line_auth_mappings に保存
        await supabaseAdmin.from('line_auth_mappings').upsert({
          line_user_id: profile.userId,
          line_display_name: profile.displayName,
          line_email: lineEmail,
          line_picture_url: profile.pictureUrl,
          supabase_uid: supabaseUid,
        }, { onConflict: 'line_user_id' });
        console.log('[vote-callback] clients + mapping saved');
      }
    }

    // セッション作成 → vote-processing で一体化（リダイレクト1回で完結）
    if (supabaseUid) {
      // 投票の client_user_id を更新
      if (insertedVote?.id) {
        await supabaseAdmin.from('votes').update({
          client_user_id: supabaseUid,
        }).eq('id', insertedVote.id);
      }

      // メールアドレスは既に分かっている。getUserById で取り直す必要なし。
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(supabaseUid);
      const userEmail = userData.user?.email || lineEmail || `line_${profile.userId}@line.realproof.jp`;

      console.log('=== LINE Vote-Callback Debug ===');
      console.log('profile.userId:', profile.userId);
      console.log('lineEmail:', lineEmail);
      console.log('supabaseUid:', supabaseUid);
      console.log('userEmail:', userEmail);

      // 一時パスワードをセットして signInWithPassword で使う
      const tempPassword = crypto.randomUUID();
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        supabaseUid,
        { password: tempPassword }
      );

      if (!updateError) {
        console.log('[vote-callback] Password updated for:', userEmail);

        const credentials = Buffer.from(JSON.stringify({
          email: userEmail,
          password: tempPassword
        })).toString('base64url');

        // 投票完了ページのURL
        let voteConfirmedPath = `/vote-confirmed?pro=${context.professional_id}&vote_id=${voteId}&auth_method=line`;
        if (rewardParam) {
          voteConfirmedPath += `&reward=${rewardParam}`;
        }

        const lineSessionUrl = new URL('/auth/line-session', request.url);
        lineSessionUrl.searchParams.set('credentials', credentials);
        lineSessionUrl.searchParams.set('next', voteConfirmedPath);

        console.log('[vote-callback] → /auth/line-session → /vote-confirmed');
        return NextResponse.redirect(lineSessionUrl);
      } else {
        console.error('[vote-callback] Password update FAILED:', updateError.message);
      }
    } else {
      console.error('[vote-callback] supabaseUid is NULL - no session will be created');
    }

    // セッション作成に失敗してもvote-confirmedには遷移させる（フォールバック）
    console.log('[vote-callback] → /vote-confirmed (FALLBACK - no session)');
    return NextResponse.redirect(new URL(confirmPath, request.url));

  } catch (err) {
    console.error('LINE vote callback error:', err);
    return NextResponse.redirect(new URL('/?error=line_vote_failed', request.url));
  }
}
