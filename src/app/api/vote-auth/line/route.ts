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

  const channelId = process.env.LINE_CHANNEL_ID
  if (!channelId) {
    console.error('[vote-auth/line] LINE_CHANNEL_ID is not set')
    return NextResponse.json({ error: 'LINE configuration error' }, { status: 500 })
  }

  // state にコンテキスト情報を含める（CSRF対策 + 投票データ）
  const stateData = {
    nonce: crypto.randomBytes(16).toString('hex'),
    professional_id,
    qr_token,
    vote_data: vote_data_str,
  }
  const state = Buffer.from(JSON.stringify(stateData)).toString('base64url')

  // コールバックURL（デプロイ環境に応じて自動判定）
  const origin = request.nextUrl.origin
  const redirectUri = `${origin}/api/vote-auth/line/callback`

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

  console.log('[vote-auth/line] Redirecting to LINE auth, professional_id:', professional_id)
  return NextResponse.redirect(lineAuthUrl)
}
