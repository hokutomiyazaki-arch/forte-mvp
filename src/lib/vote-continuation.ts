/**
 * vote-continuation — §2-8 継続記録（スタンプ）の vote_type 再分類ロジック。
 *
 * 本人選択（visit_claim）と実際の過去票の有無を突き合わせ、エラーにはせず
 * 受理した上で vote_type / self_reported_repeat を確定させる。
 *
 *   - 「初めて」選択なのに過去票あり → vote_type を 'continuation' に再分類。
 *     selected_proof_ids / selected_personality_ids は呼び出し側でそのまま INSERT する
 *     （このヘルパーは vote_type のみ返す。集計はVIEW側フィルタで自動除外される想定）
 *   - 「2回目以降」選択なのに過去票なし → vote_type はそのまま。self_reported_repeat=true を返す
 *   - hopeful（「期待できそう」）は継続記録の対象外 — 再分類しない
 *   - visit_claim が無い（旧セッション・後方互換）場合は何もしない
 *
 * supabase は service role / anon のどちらでも動く（vote-duplicate-check.ts と同じ思想）。
 */

export type ContinuationResolution = {
  voteType: string
  selfReportedRepeat: boolean | null
}

export type ResolveContinuationParams = {
  normalizedEmail: string | null | undefined
  professionalId: string
  /** クライアントの本人選択。'first' | 'repeat'。未設定なら後方互換で何もしない */
  visitClaim?: string | null
  baseVoteType: string
}

export async function resolveContinuationVoteType(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: ResolveContinuationParams
): Promise<ContinuationResolution> {
  const { normalizedEmail, professionalId, visitClaim, baseVoteType } = params

  // 継続記録の対象外: メール/電話番号が無い・本人選択が無い(後方互換)・hopeful
  if (
    !normalizedEmail ||
    (visitClaim !== 'first' && visitClaim !== 'repeat') ||
    baseVoteType === 'hopeful'
  ) {
    return { voteType: baseVoteType, selfReportedRepeat: null }
  }

  // 過去票（全期間・同一プロ・confirmed）の有無。
  // 直近7日以内の分は checkVoteDuplicates 側で既にブロック済みのため、
  // ここに到達している時点で「あるとすれば7日より前の過去票」になる。
  const { data: pastVote } = await supabase
    .from('votes')
    .select('id')
    .eq('normalized_email', normalizedEmail)
    .eq('professional_id', professionalId)
    .eq('status', 'confirmed')
    .limit(1)
    .maybeSingle()

  const hasPastVote = !!pastVote

  if (visitClaim === 'first' && hasPastVote) {
    // 「初めて」選択なのに過去票あり → エラーにせず受理。継続記録として再分類
    return { voteType: 'continuation', selfReportedRepeat: null }
  }

  if (visitClaim === 'repeat' && !hasPastVote) {
    // 「2回目以降」選択なのに過去票なし → 受理して新チェーン開始。自己申告フラグを立てる
    return { voteType: baseVoteType, selfReportedRepeat: true }
  }

  return { voteType: baseVoteType, selfReportedRepeat: null }
}
