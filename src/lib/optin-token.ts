/**
 * Phase 4: 過去票オプトイン用 HMAC トークンユーティリティ
 *
 * normalized_email を入力に HMAC-SHA256 で署名トークンを生成・検証する。
 * 秘密鍵は環境変数 OPTIN_SECRET。
 *
 * - generateOptinToken: トークン生成 (OPTIN_SECRET 未設定時は throw)
 * - verifyOptinToken:   トークン検証 (timingSafeEqual。OPTIN_SECRET 未設定時は false)
 *
 * セキュリティ:
 *   - 通常の === 比較はタイミング攻撃に弱いため timingSafeEqual を使用
 *   - hex デコードして 32 byte 同士のバイナリ比較を行う
 *   - 入力長違い・不正 hex は例外を投げず false で安全に処理
 *   - OPTIN_SECRET の値はログに出さない
 */

import { createHmac, timingSafeEqual } from 'crypto'

export function generateOptinToken(normalizedEmail: string): string {
  const secret = process.env.OPTIN_SECRET
  if (!secret) {
    throw new Error('OPTIN_SECRET env var is not set')
  }
  return createHmac('sha256', secret)
    .update(normalizedEmail)
    .digest('hex')
}

export function verifyOptinToken(
  normalizedEmail: string,
  token: string
): boolean {
  const secret = process.env.OPTIN_SECRET
  if (!secret) {
    console.error('[verifyOptinToken] OPTIN_SECRET env var is not set')
    return false
  }

  if (typeof normalizedEmail !== 'string' || typeof token !== 'string') {
    return false
  }
  if (normalizedEmail.length === 0 || token.length === 0) {
    return false
  }

  const expected = createHmac('sha256', secret)
    .update(normalizedEmail)
    .digest('hex')

  if (expected.length !== token.length) {
    return false
  }

  try {
    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(token, 'hex')
    )
  } catch {
    return false
  }
}
