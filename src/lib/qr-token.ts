/**
 * QRトークン関連のユーティリティ
 *
 * 2026-04-28: X-Day（2026-06-30、35,000人配信）前のLINE拡散対策として
 * TTL を 24h → 1h に短縮 + ワンタイム化（used_at マーク）を導入。
 * 田中ゆうきさん16票/日（2026-04-27）の調査結果を受けた防御強化。
 */

import { getSupabaseAdmin } from './supabase'
import { createClientComponentClient } from './supabase-client'

/**
 * QRトークンの有効期限（ミリ秒）
 * 24時間。
 */
export const QR_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

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

/**
 * QRトークンを使用済みにマークする（クライアント側用）
 *
 * 'use client' なコンポーネント（vote/[id]/page.tsx の各ハンドラ等）から
 * 呼び出すための派生関数。Service Role Key にアクセスできないため、
 * `/api/db` プロキシ経由で UPDATE する。
 *
 * 設計意図:
 *   - サーバー側 markTokenUsed と同じ「フェイルオープン + 多重UPDATEガード」を維持
 *   - /api/db の update ハンドラは現状 eq フィルターしか適用しないため、
 *     `.update(...).is('used_at', null)` をチェーンしても is 句が落ちて
 *     既使用トークンまで再 UPDATE してしまう。SELECT で「未使用」のみを
 *     確認してから UPDATE する 2 段階方式で多重UPDATEガードを実装する。
 *   - SELECT→UPDATE 間のレース（同 token 同時UPDATE）は Set 2 の
 *     30分プロクールダウンで多層防御する想定（指示書 Phase 6 エッジケース表）
 *
 * @param token QRトークンのUUID文字列または16進文字列
 */
export async function markTokenUsedFromClient(token: string): Promise<void> {
  if (!token) return

  try {
    const supabase: any = createClientComponentClient()

    const { data: existing } = await supabase
      .from('qr_tokens')
      .select('id')
      .eq('token', token)
      .is('used_at', null)
      .maybeSingle()

    if (!existing) {
      return
    }

    const { error } = await supabase
      .from('qr_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token)

    if (error) {
      console.error('[markTokenUsedFromClient] DB error:', { token, error })
    }
  } catch (e) {
    console.error('[markTokenUsedFromClient] exception:', { token, e })
  }
}
