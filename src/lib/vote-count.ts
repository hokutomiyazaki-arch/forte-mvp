/**
 * プロ単位の累積投票数取得ヘルパー
 *
 * Phase 2: ダッシュボードバナーと月次通知メールで再利用するため
 *          src/lib/ に切り出し。
 *
 * vote_summary VIEW は (professional_id, proof_id, vote_count) の集計で
 * プロ単位の合計を出すには SUM が必要なため、Phase 2 では votes 直接 COUNT を採用。
 *
 * vote_type フィルタはかけない (proof / personality_only / hopeful 等を全種類カウント)。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getProVoteCount(supabase: any, proId: string): Promise<number> {
  const { count } = await supabase
    .from('votes')
    .select('*', { count: 'exact', head: true })
    .eq('professional_id', proId)
  return count || 0
}
