/**
 * メール配信停止用トークン生成・検証
 *
 * professional_id を HMAC-SHA256 で署名（CRON_SECRET を鍵に使用）。
 * トークン形式: {professional_id}.{hmac_hex}
 */

import crypto from 'crypto'

/** professional_id からunsubscribeトークンを生成 */
export function generateUnsubscribeToken(professionalId: string): string {
  const secret = process.env.CRON_SECRET || ''
  const hmac = crypto.createHmac('sha256', secret).update(professionalId).digest('hex')
  return `${professionalId}.${hmac}`
}

/** トークンを検証し、professional_id を返す（不正なら null） */
export function verifyUnsubscribeToken(token: string): string | null {
  const secret = process.env.CRON_SECRET
  if (!secret) return null

  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [professionalId, hmacValue] = parts
  const expected = crypto.createHmac('sha256', secret).update(professionalId).digest('hex')

  if (hmacValue !== expected) return null
  return professionalId
}
