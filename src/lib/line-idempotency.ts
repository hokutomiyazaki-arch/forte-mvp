/**
 * line-idempotency — LINE OAuth callback の冪等性を保証するヘルパー。
 *
 * 背景:
 *   LINE 内蔵ブラウザ / Liff で OAuth callback が二重発火し、
 *   同じ lineUserId + professionalId の投票が 0.04 秒差で 2 件 INSERT される
 *   バグが発生していた。checkVoteDuplicates → INSERT 間の race condition が
 *   アプリケーション層では塞げないため、DB UNIQUE 制約で serialize する。
 *
 * 使い方:
 *   callback 冒頭（lineUserId / professional_id が確定した直後）で claim。
 *
 *     const claim = await claimLineCallback(supabaseAdmin, lineUserId, professionalId)
 *     if (!claim.acquired) {
 *       // 別の callback が先に処理中 / 処理済み
 *       if (claim.existingVoteId) redirect vote-confirmed
 *       else redirect with short wait / retry
 *     }
 *
 * 注意:
 *   migrations/024_line_oauth_claims.sql が適用されていない環境では
 *   「テーブルが無い」エラー（42P01）になる。その場合は fail-open で
 *   acquired=true を返し、正当な投票をブロックしないようにする。
 */

const BUCKET_MS = 5000 // 5 秒バケット

export type ClaimResult = {
  acquired: boolean
  /** 先行 callback が既に INSERT 済みの vote.id（あれば） */
  existingVoteId?: string
}

/**
 * LINE callback の冪等性 claim。
 *
 * @param supabase service role supabase client
 * @param lineUserId LINE profile.userId（ユニーク識別子）
 * @param professionalId 投票先プロ ID
 */
export async function claimLineCallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  lineUserId: string,
  professionalId: string
): Promise<ClaimResult> {
  const bucket = Math.floor(Date.now() / BUCKET_MS)
  const claimKey = `${lineUserId}:${professionalId}:${bucket}`

  const { error } = await supabase
    .from('line_oauth_claims')
    .insert({ claim_key: claimKey })

  if (!error) {
    // claim 成功 — このリクエストが先行
    return { acquired: true }
  }

  // PostgreSQL 23505 = unique_violation → 他 callback が同じバケットで claim 済み
  if (error.code === '23505') {
    // 先行 callback の vote が INSERT 済みか確認
    const { data: existingVote } = await supabase
      .from('votes')
      .select('id')
      .eq('auth_provider_id', lineUserId)
      .eq('professional_id', professionalId)
      .eq('auth_method', 'line')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return {
      acquired: false,
      existingVoteId: existingVote?.id,
    }
  }

  // 42P01 = undefined_table → migration 未適用。fail-open。
  if (error.code === '42P01') {
    console.warn('[line-idempotency] line_oauth_claims table not found — migration 024 not applied. Falling back to non-atomic check.')
    return { acquired: true }
  }

  // 想定外エラー — fail-open（正当な投票をブロックしないため）
  console.error('[line-idempotency] Unexpected error during claim:', error)
  return { acquired: true }
}
