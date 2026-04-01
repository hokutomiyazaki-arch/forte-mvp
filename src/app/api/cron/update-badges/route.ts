import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Cron認証チェック
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  try {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // 全アクティブプロを取得
    const { data: professionals, error: prosError } = await supabase
      .from('professionals')
      .select('id')
      .is('deactivated_at', null)

    if (prosError) throw prosError

    let updatedCount = 0

    for (const pro of professionals || []) {
      const proId = pro.id

      // 全プルーフ取得（vote_type = 'proof'）
      const { data: allVotes } = await supabase
        .from('votes')
        .select('id, created_at, selected_proof_ids')
        .eq('professional_id', proId)
        .eq('vote_type', 'proof')

      const totalProofs = allVotes?.length || 0

      // --- 急上昇バッジ: 直近30日に5件以上 ---
      const recentVotes = (allVotes || []).filter(
        v => new Date(v.created_at) >= thirtyDaysAgo
      )
      const badgeRising = recentVotes.length >= 5

      // --- カテゴリ別集計（この道のプロ + マルチ + トップ用）---
      const { data: proofItems } = await supabase
        .from('proof_items')
        .select('id, tab')

      const itemTabMap: Record<string, string> = {}
      for (const item of proofItems || []) {
        itemTabMap[item.id] = item.tab
      }

      // カテゴリ別プルーフ数を集計
      const categoryCount: Record<string, number> = {}
      for (const vote of allVotes || []) {
        for (const itemId of vote.selected_proof_ids || []) {
          const tab = itemTabMap[itemId]
          if (tab) {
            categoryCount[tab] = (categoryCount[tab] || 0) + 1
          }
        }
      }

      // --- この道のプロバッジ: 1カテゴリに70%以上集中 × 15件以上 ---
      let badgeSpecialist = false
      for (const [, count] of Object.entries(categoryCount)) {
        if (count >= 15 && totalProofs > 0 && count / totalProofs >= 0.7) {
          badgeSpecialist = true
          break
        }
      }

      // --- マルチスペシャリストバッジ: 4カテゴリ以上 × 各5件以上 ---
      const qualifiedCategories = Object.values(categoryCount).filter(c => c >= 5)
      const badgeMulti = qualifiedCategories.length >= 4

      // --- トップクラスバッジ: 「この道のプロ」条件を満たすカテゴリが3つ以上 ---
      let specialistCategoryCount = 0
      for (const [, count] of Object.entries(categoryCount)) {
        if (count >= 15 && totalProofs > 0 && count / totalProofs >= 0.7) {
          specialistCategoryCount++
        }
      }
      const badgeTop = specialistCategoryCount >= 3

      // DBを更新
      const { error: updateError } = await supabase
        .from('professionals')
        .update({
          badge_rising: badgeRising,
          badge_specialist: badgeSpecialist,
          badge_multi: badgeMulti,
          badge_top: badgeTop,
          badges_updated_at: now.toISOString(),
        })
        .eq('id', proId)

      if (!updateError) updatedCount++
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      total: professionals?.length || 0,
      timestamp: now.toISOString(),
    })
  } catch (error) {
    console.error('Badge update error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
