/**
 * プロ単位クールダウンチェック
 *
 * 2026-04-28: Set 2 — X-Day（2026-06-30）前のLINE拡散対策の多層防御。
 * 同一プロが30分以内に複数票を受けることを禁止する（投票者横断）。
 *
 * Set 1（QRトークンワンタイム化）の最終防衛線として機能する。
 * REALPROOF思想: 1人1人と向き合った深い変容のみを票として記録。
 *
 * 既存クールダウンとの違い:
 *   - 7日 / 30分（既存）: voter 単位（同じ人が連投できない）
 *   - 30分プロ（このファイル）: pro 単位（同じプロが短時間で複数票を受けない）
 */

import { getSupabaseAdmin } from './supabase'
import { createClientComponentClient } from './supabase-client'

export interface ProCooldownResult {
  blocked: boolean
  remainingMin?: number
  lastVoteAt?: string
}

const COOLDOWN_MIN = 30

/**
 * 投票者向けエラーメッセージ（CEO確定）
 * セキュリティ的には曖昧化したいが、UX優先で詳細表示。
 * 6+箇所で使うため定数化（1箇所変更で済む）。
 */
export const PRO_COOLDOWN_MESSAGE =
  'このプロは今投票が集中しています。しばらく待ってからもう一度お試しください。'

/**
 * プロ単位30分クールダウンチェック（サーバー側）
 *
 * 設計意図:
 *   - フェイルオープン: DBエラー時は投票を通す（教訓: 過度なブロックは正常ユーザーを傷つける）
 *   - status='confirmed' のみ対象: pending状態は集計しない
 *   - サーバー専用: getSupabaseAdmin() は Service Role を使うためクライアントからは呼ばない
 *
 * @param professionalId 投票先プロID
 * @returns blocked: true なら投票を拒否すべき
 */
export async function checkProCooldown(
  professionalId: string
): Promise<ProCooldownResult> {
  if (!professionalId) return { blocked: false }

  const cooldownAgo = new Date(Date.now() - COOLDOWN_MIN * 60 * 1000).toISOString()

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('votes')
      .select('id, created_at')
      .eq('professional_id', professionalId)
      .eq('status', 'confirmed')
      .gt('created_at', cooldownAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[checkProCooldown] DB error:', { professionalId, error })
      return { blocked: false }
    }
    if (!data) return { blocked: false }

    return computeBlocked(data.created_at)
  } catch (e) {
    console.error('[checkProCooldown] exception:', { professionalId, e })
    return { blocked: false }
  }
}

/**
 * プロ単位30分クールダウンチェック（クライアント側）
 *
 * 'use client' なコンポーネント（vote/[id]/page.tsx の各ハンドラ等）から
 * 呼び出すための派生関数。Service Role Key にアクセスできないため、
 * `/api/db` プロキシ経由で SELECT する。
 *
 * 設計意図:
 *   - サーバー側 checkProCooldown と同じ「フェイルオープン」を維持
 *   - /api/db の select ハンドラは eq/gt/order/limit/maybeSingle 全対応済み
 *
 * @param professionalId 投票先プロID
 * @returns blocked: true なら投票を拒否すべき
 */
export async function checkProCooldownFromClient(
  professionalId: string
): Promise<ProCooldownResult> {
  if (!professionalId) return { blocked: false }

  const cooldownAgo = new Date(Date.now() - COOLDOWN_MIN * 60 * 1000).toISOString()

  try {
    const supabase: any = createClientComponentClient()
    const { data, error } = await supabase
      .from('votes')
      .select('id, created_at')
      .eq('professional_id', professionalId)
      .eq('status', 'confirmed')
      .gt('created_at', cooldownAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[checkProCooldownFromClient] DB error:', { professionalId, error })
      return { blocked: false }
    }
    if (!data) return { blocked: false }

    return computeBlocked(data.created_at)
  } catch (e) {
    console.error('[checkProCooldownFromClient] exception:', { professionalId, e })
    return { blocked: false }
  }
}

function computeBlocked(lastVoteAt: string): ProCooldownResult {
  const elapsedMs = Date.now() - new Date(lastVoteAt).getTime()
  const remainingMin = Math.max(
    1,
    Math.ceil((COOLDOWN_MIN * 60 * 1000 - elapsedMs) / 60000)
  )
  return {
    blocked: true,
    remainingMin,
    lastVoteAt,
  }
}
