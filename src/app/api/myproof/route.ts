import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/myproof
 * マイプルーフカード＋アイテム取得（カードが無ければ自動作成）
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    // カード取得 or 自動作成
    let { data: card } = await supabase
      .from('my_proof_cards')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (!card) {
      const qr_token = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      const { data: newCard } = await supabase
        .from('my_proof_cards')
        .insert({ user_id: userId, qr_token })
        .select()
        .maybeSingle()
      card = newCard
    }

    // アイテム取得
    const { data: items } = await supabase
      .from('my_proof_items')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })

    // professional型のアイテムにプロ情報を付与
    const proItems = (items || []).filter((i: any) => i.item_type === 'professional' && i.professional_id)
    let enrichedItems = items || []

    if (proItems.length > 0) {
      const proIds = Array.from(new Set(proItems.map((i: any) => i.professional_id)))
      const [proResult, voteResult] = await Promise.all([
        supabase.from('professionals')
          .select('id, name, display_name, title, photo_url')
          .in('id', proIds),
        supabase.from('votes')
          .select('professional_id', { count: 'exact' })
          .in('professional_id', proIds)
          .eq('status', 'confirmed'),
      ])

      const proMap = new Map<string, any>()
      if (proResult.data) {
        for (const p of proResult.data) proMap.set(p.id, p)
      }

      // プロごとの投票数をvote_summaryから取得
      const { data: voteSummary } = await supabase
        .from('vote_summary')
        .select('professional_id, vote_count')
        .in('professional_id', proIds)

      const voteCountMap = new Map<string, number>()
      if (voteSummary) {
        for (const vs of voteSummary) {
          const current = voteCountMap.get(vs.professional_id) || 0
          voteCountMap.set(vs.professional_id, current + (vs.vote_count || 0))
        }
      }

      enrichedItems = (items || []).map((item: any) => {
        if (item.item_type === 'professional' && item.professional_id) {
          const pro = proMap.get(item.professional_id)
          return {
            ...item,
            pro_name: pro?.name || pro?.display_name || '不明',
            pro_title: pro?.title || '',
            pro_photo_url: pro?.photo_url || null,
            pro_vote_count: voteCountMap.get(item.professional_id) || 0,
          }
        }
        return item
      })
    }

    return NextResponse.json({ card, items: enrichedItems })
  } catch (err: any) {
    console.error('[api/myproof] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
