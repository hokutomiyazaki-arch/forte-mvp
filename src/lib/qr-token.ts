/**
 * QRトークン関連のユーティリティ
 *
 * 2026-04-28: X-Day（2026-06-30、35,000人配信）前のLINE拡散対策として
 * TTL を 24h → 1h に短縮 + ワンタイム化（used_at マーク）を導入。
 * 田中ゆうきさん16票/日（2026-04-27）の調査結果を受けた防御強化。
 */

import { getSupabaseAdmin } from './supabase'

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

/**
 * QRトークンを使用済みにマークする
 * 投票INSERT成功後に呼ぶ。失敗してもsilent（投票自体は成立しているため）
 *
 * 設計意図:
 *   - フェイルオープン: DBエラー時も投票自体は成立させる（呼び元は await して例外を握る）
 *   - 多重UPDATEガード: .is('used_at', null) で既使用トークンには UPDATE しない
 *   - サーバー専用: getSupabaseAdmin() は Service Role Key を使うため
 *     クライアント側からは呼ばない（Server Action / API Route 経由で呼ぶこと）
 *
 * @param token QRトークンのUUID文字列または16進文字列
 */
export async function markTokenUsed(token: string): Promise<void> {
  if (!token) return

  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('qr_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token)
      .is('used_at', null)

    if (error) {
      console.error('[markTokenUsed] DB error:', { token, error })
    }
  } catch (e) {
    console.error('[markTokenUsed] exception:', { token, e })
  }
}
