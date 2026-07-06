import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const channelId = process.env.LINE_CHANNEL_ID
  if (!channelId) {
    console.error('[auth/line/start] LINE_CHANNEL_ID is not set')
    return NextResponse.json({ error: 'LINE configuration error' }, { status: 500 })
  }

  // state は CSRF 用 nonce のみ（投票専用パラメータは持たない）
  const stateData = {
    nonce: crypto.randomBytes(16).toString('hex'),
  }
  const state = Buffer.from(JSON.stringify(stateData)).toString('base64url')

  // コールバックURL（デプロイ環境に応じて自動判定）
  const origin = request.nextUrl.origin
  const redirectUri = `${origin}/api/auth/line/callback`

  // LINE認証URL構築
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: channelId,
    redirect_uri: redirectUri,
    state: state,
    scope: 'profile openid email',
    bot_prompt: 'normal',
  })

  const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`

  console.log('[auth/line/start] Redirecting to LINE auth')
  return NextResponse.redirect(lineAuthUrl)
}
