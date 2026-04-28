/**
 * QRトークンの有効期限関連のユーティリティ
 *
 * 2026-04-28: X-Day（2026-06-30、35,000人配信）前のLINE拡散対策として
 * TTL を 24h → 1h に短縮。
 * 田中ゆうきさん16票/日（2026-04-27）の調査結果を受けた防御強化。
 */

/**
 * QRトークンの有効期限（ミリ秒）
 * 1時間。
 */
export const QR_TOKEN_TTL_MS = 60 * 60 * 1000

/**
 * 新規トークンの expires_at を計算する
 * @returns ISO8601形式の文字列（DBにINSERT用）
 */
export function calcQrTokenExpiry(): string {
  return new Date(Date.now() + QR_TOKEN_TTL_MS).toISOString()
}
