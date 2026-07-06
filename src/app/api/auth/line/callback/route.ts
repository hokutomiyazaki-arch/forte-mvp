import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const error = searchParams.get('error')
  const origin = request.nextUrl.origin

  // LINE認証がキャンセル / state 不正
  if (error || !code || !stateParam) {
    console.error('[auth/line/callback] Auth error or cancelled:', {
      error,
      has_code: !!code,
      has_state: !!stateParam,
    })
    return NextResponse.redirect(new URL('/sign-in?error=line_failed', origin))
  }

  // state デコード（CSRF 用 nonce のみ）
  try {
    JSON.parse(Buffer.from(stateParam, 'base64url').toString())
  } catch {
    console.error('[auth/line/callback] Invalid state parameter')
    return NextResponse.redirect(new URL('/sign-in?error=line_failed', origin))
  }

  try {
    // Step 1: code → access_token + id_token（vote-auth/line/callback 流用）
    const channelId = process.env.LINE_CHANNEL_ID!
    const channelSecret = process.env.LINE_CHANNEL_SECRET!
    const redirectUri = `${origin}/api/auth/line/callback`

    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      cache: 'no-store',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    })

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      console.error('[auth/line/callback] Token exchange failed:', tokenRes.status, errBody)
      return NextResponse.redirect(new URL('/sign-in?error=line_failed', origin))
    }

    const tokenData = await tokenRes.json()
    console.log('[auth/line/callback] Token exchange OK')

    // Step 2: メールアドレス取得（id_token をデコード。署名検証は省略 = 既存流用）
    let email = ''
    if (tokenData.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokenData.id_token.split('.')[1], 'base64').toString()
        )
        email = payload.email || ''
        console.log('[auth/line/callback] Email from id_token:', email ? 'found' : 'not found')
      } catch (e) {
        console.error('[auth/line/callback] Failed to decode id_token:', e)
      }
    }

    // Step 3: email が取れない場合 → 通常ブラウザ誘導（sign-in で案内）
    if (!email) {
      console.error('[auth/line/callback] No email from LINE (email scope not granted)')
      return NextResponse.redirect(new URL('/sign-in?error=line_no_email', origin))
    }

    email = email.trim().toLowerCase()

    // Step 4: Clerk で既存ユーザー特定（vote-auth/line/callback と同じアクセス方法）
    const clerk = await clerkClient()
    const list = await clerk.users.getUserList({ emailAddress: [email] })
    const user = list.data?.[0]
    if (!user) {
      console.error('[auth/line/callback] No Clerk account for LINE email')
      return NextResponse.redirect(new URL('/sign-in?error=line_no_account', origin))
    }

    // Step 5: サインイントークン発行（短命・一回限り）
    const st = await clerk.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: 120,
    })

    // Step 6: 受け皿ページへ（PWA 内で Clerk セッション化）
    console.log('[auth/line/callback] Sign-in token issued, redirecting to line-complete')
    return NextResponse.redirect(
      new URL(`/auth/line-complete?ticket=${st.token}`, origin)
    )
  } catch (err) {
    console.error('[auth/line/callback] Unexpected error:', err)
    return NextResponse.redirect(new URL('/sign-in?error=line_failed', origin))
  }
}
