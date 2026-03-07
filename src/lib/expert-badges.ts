import { SupabaseClient } from '@supabase/supabase-js'

/**
 * エキスパートバッジの自動判定・更新
 * 投票INSERT成功後に呼び出す。
 *
 * 判定ロジック:
 * - vote_summary ビューから proof_id 別の vote_count を取得
 * - proof_items の tab と JOIN して、15票以上の項目を抽出
 * - is_double_expert: 同一tabで15票以上の項目が2つ以上
 * - is_cross_expert: 異なるtabにまたがって15票以上の項目が2つ以上
 * - is_triple_expert: 同一tabで15票以上の項目が3つ以上
 * - is_cross_master: 異なるtabにまたがって15票以上の項目が3つ以上
 */
export async function checkExpertBadges(
  supabase: SupabaseClient,
  professionalId: string
) {
  try {
    const EXPERT_THRESHOLD = 15

    // vote_summary から proof_id 別の得票数を取得
    const { data: summary } = await supabase
      .from('vote_summary')
      .select('proof_id, vote_count')
      .eq('professional_id', professionalId)

    if (!summary || summary.length === 0) return

    // 15票以上の proof_id を抽出
    const qualifiedProofIds = summary
      .filter(s => (s.vote_count || 0) >= EXPERT_THRESHOLD)
      .map(s => s.proof_id)

    if (qualifiedProofIds.length === 0) {
      // 条件を満たす項目がなければ全てfalse
      await supabase
        .from('professionals')
        .update({
          is_double_expert: false,
          is_cross_expert: false,
          is_triple_expert: false,
          is_cross_master: false,
        })
        .eq('id', professionalId)
      return
    }

    // proof_items から tab 情報を取得
    const { data: proofItems } = await supabase
      .from('proof_items')
      .select('id, tab')
      .in('id', qualifiedProofIds)

    if (!proofItems || proofItems.length === 0) return

    // tab ごとにグループ化して数をカウント
    const tabGroups: Record<string, number> = {}
    for (const pi of proofItems) {
      if (pi.tab) {
        tabGroups[pi.tab] = (tabGroups[pi.tab] || 0) + 1
      }
    }

    const qualifiedCount = proofItems.length
    const uniqueTabs = Object.keys(tabGroups).length

    // バッジ判定
    const isDoubleExpert = Object.values(tabGroups).some(count => count >= 2)
    const isCrossExpert = qualifiedCount >= 2 && uniqueTabs >= 2
    const isTripleExpert = Object.values(tabGroups).some(count => count >= 3)
    const isCrossMaster = qualifiedCount >= 3 && uniqueTabs >= 2

    // professionals テーブルを更新
    await supabase
      .from('professionals')
      .update({
        is_double_expert: isDoubleExpert,
        is_cross_expert: isCrossExpert,
        is_triple_expert: isTripleExpert,
        is_cross_master: isCrossMaster,
      })
      .eq('id', professionalId)
  } catch (err) {
    console.error('[checkExpertBadges] error:', err)
    // バッジ判定の失敗は投票自体に影響しない
  }
}
