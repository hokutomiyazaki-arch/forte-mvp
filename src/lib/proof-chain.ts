import { createHash, randomUUID } from 'crypto'

/**
 * プルーフのハッシュを計算する
 *
 * ハッシュの入力:
 * - voter_email（または normalized_email）
 * - professional_id
 * - vote_type
 * - selected_proof_ids（JSON文字列化してソート済み）
 * - comment
 * - created_at（ISO文字列）
 * - nonce（ランダム文字列）
 * - prev_hash（1つ前のプルーフのハッシュ。最初のプルーフは "GENESIS"）
 */

export interface ProofHashInput {
  voter_email: string
  professional_id: string
  vote_type: string
  selected_proof_ids: string[] | null
  comment: string | null
  created_at: string // ISO 8601
  nonce: string
  prev_hash: string
}

export function computeProofHash(input: ProofHashInput): string {
  const sortedProofIds = input.selected_proof_ids
    ? [...input.selected_proof_ids].sort().join(',')
    : ''

  const payload = [
    input.voter_email,
    input.professional_id,
    input.vote_type,
    sortedProofIds,
    input.comment || '',
    input.created_at,
    input.nonce,
    input.prev_hash,
  ].join('|')

  return createHash('sha256').update(payload).digest('hex')
}

export function generateNonce(): string {
  return randomUUID()
}

/**
 * 最初のプルーフ（チェーンの起点）用の prev_hash 定数
 */
export const GENESIS_HASH = 'GENESIS'

/**
 * ソフトデリート時にハッシュチェーンを維持するための定数
 * 個人情報を消してもハッシュとチェーン構造は残す
 */
export const DELETED_MARKER = '[deleted]'

/**
 * チェーンの整合性を検証する
 * votes配列は created_at 昇順でソート済みであること
 */
export function verifyChain(
  votes: Array<{
    voter_email: string
    professional_id: string
    vote_type: string
    selected_proof_ids: string[] | null
    comment: string | null
    created_at: string
    proof_nonce: string
    proof_hash: string
    prev_hash: string
  }>
): { valid: boolean; brokenAt?: number } {
  for (let i = 0; i < votes.length; i++) {
    const vote = votes[i]

    // prev_hash の整合性チェック
    if (i === 0) {
      if (vote.prev_hash !== GENESIS_HASH) {
        return { valid: false, brokenAt: i }
      }
    } else {
      if (vote.prev_hash !== votes[i - 1].proof_hash) {
        return { valid: false, brokenAt: i }
      }
    }

    // ソフトデリート済み: ハッシュ再計算はスキップ、チェーンリンクのみ検証
    if (vote.voter_email === DELETED_MARKER) {
      continue
    }

    // ハッシュの再計算と比較
    const recomputed = computeProofHash({
      voter_email: vote.voter_email,
      professional_id: vote.professional_id,
      vote_type: vote.vote_type,
      selected_proof_ids: vote.selected_proof_ids,
      comment: vote.comment,
      created_at: vote.created_at,
      nonce: vote.proof_nonce,
      prev_hash: vote.prev_hash,
    })

    if (recomputed !== vote.proof_hash) {
      return { valid: false, brokenAt: i }
    }
  }

  return { valid: true }
}
