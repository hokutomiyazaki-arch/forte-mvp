// src/lib/line-auth.ts
// LINE Login 認証ユーティリティ

import crypto from 'crypto';

// LINE Login の定数
const LINE_AUTH_URL = 'https://access.line.me/oauth2/v2.1/authorize';
const LINE_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';
const LINE_PROFILE_URL = 'https://api.line.me/v2/profile';

// コンテキスト型定義
export type LineAuthContext =
  | { type: 'vote'; professional_id: string; qr_token: string }
  | { type: 'pro_register' }
  | { type: 'pro_login' };

// State の暗号化/復号化
export function encryptState(context: LineAuthContext): string {
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = JSON.stringify({ ...context, nonce, ts: Date.now() });
  return Buffer.from(payload).toString('base64url');
}

export function decryptState(state: string): LineAuthContext & { nonce: string; ts: number } {
  const payload = Buffer.from(state, 'base64url').toString();
  return JSON.parse(payload);
}

// LINE認証URLを生成
export function buildLineAuthUrl(context: LineAuthContext): string {
  const state = encryptState(context);
  const channelId = process.env.LINE_CHANNEL_ID || process.env.NEXT_PUBLIC_LINE_CHANNEL_ID;
  const redirectUri = process.env.LINE_REDIRECT_URI;

  if (!channelId || !redirectUri) {
    throw new Error('LINE_CHANNEL_ID or LINE_REDIRECT_URI not configured');
  }

  // 投票用は別のコールバックURLを使う
  const callbackUri = context.type === 'vote'
    ? redirectUri.replace('/callback', '/vote-callback')
    : redirectUri;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: channelId,
    redirect_uri: callbackUri,
    state: state,
    scope: 'profile openid',  // email は申請後に 'profile openid email' に変更
    bot_prompt: 'aggressive',  // LINE公式アカウントの友だち追加を積極的に表示
  });

  return `${LINE_AUTH_URL}?${params.toString()}`;
}

// LINE Token取得
export async function exchangeCodeForToken(code: string, isVoteCallback: boolean = false): Promise<{
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}> {
  const redirectUri = process.env.LINE_REDIRECT_URI!;
  const callbackUri = isVoteCallback
    ? redirectUri.replace('/callback', '/vote-callback')
    : redirectUri;

  const response = await fetch(LINE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: callbackUri,
      client_id: process.env.LINE_CHANNEL_ID!,
      client_secret: process.env.LINE_CHANNEL_SECRET!,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LINE token exchange failed: ${error}`);
  }

  return response.json();
}

// LINE Profile取得
export async function getLineProfile(accessToken: string): Promise<{
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}> {
  const response = await fetch(LINE_PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LINE profile fetch failed: ${error}`);
  }

  return response.json();
}

// ID Token からメールアドレスを取得（将来用、email permission取得後）
export function extractEmailFromIdToken(idToken: string): string | null {
  try {
    const payload = idToken.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return decoded.email || null;
  } catch {
    return null;
  }
}
