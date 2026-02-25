// src/lib/line-auth-client.ts
// クライアントサイドでLINE認証URLを生成するユーティリティ
// iOS SafariでUniversal Linkを有効にするため、
// サーバーサイドリダイレクト(NextResponse.redirect)ではなく
// クライアントサイド(window.location.href)で直接LINE URLに遷移する

export type VoteData = {
  selected_proof_ids: string[] | null;
  selected_personality_ids: string[] | null;
  comment: string | null;
  vote_type: string;
  professional_id: string;
  session_count: string;
  selected_reward_id?: string | null;
  qr_token?: string | null;
};

export type LineAuthClientContext =
  | { type: 'vote'; professional_id: string; qr_token: string; vote_data: VoteData }
  | { type: 'pro_register' }
  | { type: 'pro_login' }
  | { type: 'client_login' };

/**
 * UTF-8文字列をbase64urlエンコード（ブラウザ用）
 * サーバーサイドの Buffer.from(str).toString('base64url') と互換
 */
function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * クライアントサイドでLINE認証URLを生成
 * サーバーサイドの buildLineAuthUrl() (line-auth.ts) と同じstate形式を使用
 *
 * NOTE: callback側のtoken exchangeで使用する LINE_REDIRECT_URI (サーバー環境変数) が
 * ${window.location.origin}/api/auth/line/callback と一致している必要がある
 */
export function buildLineAuthUrlClient(context: LineAuthClientContext): string {
  const channelId = process.env.NEXT_PUBLIC_LINE_CHANNEL_ID;
  if (!channelId) {
    throw new Error('NEXT_PUBLIC_LINE_CHANNEL_ID is not configured');
  }

  // State: サーバーサイドの encryptState() と同じ形式
  // { ...context, nonce, ts } を base64url エンコード
  const nonce = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
  const payload = JSON.stringify({ ...context, nonce, ts: Date.now() });
  const state = toBase64Url(payload);

  // Redirect URI: window.location.origin から構築
  const baseCallbackUri = `${window.location.origin}/api/auth/line`;
  const redirectUri = context.type === 'vote'
    ? `${baseCallbackUri}/vote-callback`
    : `${baseCallbackUri}/callback`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: channelId,
    redirect_uri: redirectUri,
    state: state,
    scope: 'profile openid',
    bot_prompt: 'aggressive',
  });

  return `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
}
