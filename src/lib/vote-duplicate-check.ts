/**
 * vote-duplicate-check — 投票の重複チェック3層を共通化する。
 *
 * 層（判定順、最初に引っかかったものを返す）:
 *   1. 7日リピート（同じプロ）    → 'already_voted'
 *   2. 30分クールダウン（全プロ横断） → 'cooldown'
 *   3. 1分重複（ダブルサブミット防止） → 'duplicate_submit'
 *
 * 自己投票チェックはハンドラ毎に粒度が違う（contact_email / Clerk emails
 * iteration / clients 照合 等）ため、このヘルパーには含めない。呼び出し側で
 * 個別に実装する。
 *
 * レースコンディション（23505）は INSERT 側で処理する（このヘルパーの外）。
 *
 * supabase は service role / anon のどちらでも動く。
 */

import { normalizeEmail } from './normalize-email'

export type VoteDuplicateReason = 'already_voted' | 'cooldown' | 'duplicate_submit'

/**
 * flat型: `ok: boolean` + optional fields。
 *
 * 理由: discriminated union にすると呼び出し側で narrowing が必要になり、
 *       一部の TypeScript 設定下では `if (!result.ok)` 分岐内でも
 *       `result.reason` が見えないビルドエラーになる。全 optional にすることで
 *       narrowing 不要、将来フィールド追加も安全。
 */
export type VoteDuplicateResult = {
  ok: boolean
  reason?: VoteDuplicateReason
  existingVoteId?: string
  recentVoteCreatedAt?: string
}

export type CheckVoteDuplicatesParams = {
  /** メール or 電話番号。内部で normalizeEmail() を適用する。 */
  voterIdentifier: string | null | undefined
  professionalId: string
}

export async function checkVoteDuplicates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: CheckVoteDuplicatesParams
): Promise<VoteDuplicateResult> {
  const normalized = normalizeEmail(params.voterIdentifier || '')
  if (!normalized) return { ok: true }

  // 1. 7日リピート（同じプロ）
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: repeatVote } = await supabase
    .from('votes')
    .select('id, created_at')
    .eq('normalized_email', normalized)
    .eq('professional_id', params.professionalId)
    .eq('status', 'confirmed')
    .gt('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (repeatVote) {
    return {
      ok: false,
      reason: 'already_voted',
      existingVoteId: repeatVote.id,
      recentVoteCreatedAt: repeatVote.created_at,
    }
  }

  // 2. 30分クールダウン（全プロ横断）
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data: cooldownVote } = await supabase
    .from('votes')
    .select('created_at')
    .eq('normalized_email', normalized)
    .eq('status', 'confirmed')
    .gt('created_at', thirtyMinAgo)
    .limit(1)
    .maybeSingle()

  if (cooldownVote) {
    return {
      ok: false,
      reason: 'cooldown',
      recentVoteCreatedAt: cooldownVote.created_at,
    }
  }

  // 3. 1分重複（ダブルサブミット防止）
  const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString()
  const { data: duplicateVote } = await supabase
    .from('votes')
    .select('id')
    .eq('normalized_email', normalized)
    .eq('professional_id', params.professionalId)
    .eq('status', 'confirmed')
    .gt('created_at', oneMinAgo)
    .maybeSingle()

  if (duplicateVote) {
    return {
      ok: false,
      reason: 'duplicate_submit',
      existingVoteId: duplicateVote.id,
    }
  }

  return { ok: true }
}
