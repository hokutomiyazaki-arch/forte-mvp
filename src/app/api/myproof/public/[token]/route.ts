import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/myproof/public/[token]
 * 公開マイプルーフページ用（認証不要）
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const supabase = getSupabaseAdmin()

    const { data: card } = await supabase
      .from('my_proof_cards')
      .select('*')
      .eq('qr_token', token)
      .eq('is_public', true)
      .maybeSingle()

    if (!card) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // カードオーナーの情報
    const [clientResult, proResult] = await Promise.all([
      supabase.from('clients')
        .select('nickname, photo_url')
        .eq('user_id', card.user_id)
        .maybeSingle(),
      supabase.from('professionals')
        .select('name, display_name, photo_url')
        .eq('user_id', card.user_id)
        .is('deactivated_at', null)
        .maybeSingle(),
    ])

    const ownerName = clientResult.data?.nickname || proResult.data?.name || proResult.data?.display_name || 'ユーザー'
    const ownerPhoto = clientResult.data?.photo_url || proResult.data?.photo_url || null

    // アイテム取得
    const { data: items } = await supabase
      .from('my_proof_items')
      .select('*')
      .eq('user_id', card.user_id)
      .order('sort_order', { ascending: true })

    // professional型のアイテムにプロ情報を付与
    const proItems = (items || []).filter((i: any) => i.item_type === 'professional' && i.professional_id)
    let enrichedItems = items || []

    if (proItems.length > 0) {
      const proIds = Array.from(new Set(proItems.map((i: any) => i.professional_id)))

      const [proDetailsResult, voteSummaryResult] = await Promise.all([
        supabase.from('professionals')
          .select('id, name, display_name, title, photo_url')
          .in('id', proIds),
        supabase.from('vote_summary')
          .select('professional_id, vote_count')
          .in('professional_id', proIds),
      ])

      const proMap = new Map<string, any>()
      if (proDetailsResult.data) {
        for (const p of proDetailsResult.data) proMap.set(p.id, p)
      }

      const voteCountMap = new Map<string, number>()
      if (voteSummaryResult.data) {
        for (const vs of voteSummaryResult.data) {
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

    return NextResponse.json({
      card,
      owner: { name: ownerName, photo_url: ownerPhoto },
      items: enrichedItems,
    })
  } catch (err: any) {
    console.error('[api/myproof/public/[token]] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
