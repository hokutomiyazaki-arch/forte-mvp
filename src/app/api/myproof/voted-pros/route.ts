import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/myproof/voted-pros
 * 投票済みプロ一覧（マイプルーフに未追加のもの）
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    // 投票済みプロを取得（client_user_idで紐づけ）
    const [votesResult, existingItemsResult] = await Promise.all([
      supabase.from('votes')
        .select('professional_id')
        .eq('client_user_id', userId)
        .eq('status', 'confirmed'),
      supabase.from('my_proof_items')
        .select('professional_id')
        .eq('user_id', userId)
        .eq('item_type', 'professional'),
    ])

    const existingProIds = new Set(
      (existingItemsResult.data || [])
        .map((i: any) => i.professional_id)
        .filter(Boolean)
    )

    // 重複排除して未追加のprofessional_idを抽出
    const uniqueProIds = Array.from(
      new Set((votesResult.data || []).map((v: any) => v.professional_id))
    ).filter(id => !existingProIds.has(id))

    if (uniqueProIds.length === 0) {
      return NextResponse.json({ pros: [] })
    }

    // プロ情報取得
    const { data: pros } = await supabase
      .from('professionals')
      .select('id, name, display_name, title, photo_url')
      .in('id', uniqueProIds)
      .is('deactivated_at', null)

    const result = (pros || []).map((p: any) => ({
      id: p.id,
      name: p.name || p.display_name || '不明',
      title: p.title || '',
      photo_url: p.photo_url || null,
    }))

    return NextResponse.json({ pros: result })
  } catch (err: any) {
    console.error('[api/myproof/voted-pros] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
