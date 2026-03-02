import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const professional_id = searchParams.get('professional_id')
  const vote_data_str = searchParams.get('vote_data')
  const qr_token = searchParams.get('qr_token') || ''

  if (!professional_id || !vote_data_str) {
    return NextResponse.json({ error: 'Missing professional_id or vote_data' }, { status: 400 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    console.error('[vote-auth/google] GOOGLE_CLIENT_ID is not set')
    return NextResponse.json({ error: 'Google configuration error' }, { status: 500 })
  }

  // state にコンテキスト情報を含める（CSRF対策 + 投票データ）
  const stateData = {
    nonce: crypto.randomBytes(16).toString('hex'),
    professional_id,
    qr_token,
    vote_data: vote_data_str,
  }
  const state = Buffer.from(JSON.stringify(stateData)).toString('base64url')

  // コールバックURL
  const origin = request.nextUrl.origin
  const redirectUri = `${origin}/api/vote-auth/google/callback`

  // Google OAuth 2.0 認証URL構築
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state: state,
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
  })

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  console.log('[vote-auth/google] Redirecting to Google auth, professional_id:', professional_id)
  return NextResponse.redirect(googleAuthUrl)
}
