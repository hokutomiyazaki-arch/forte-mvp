import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/myproof/items
 * マイプルーフにアイテム追加
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const body = await request.json()
    const { item_type, professional_id, title, description, photo_url, category } = body

    // アイテム数上限チェック（10個）
    const { count } = await supabase
      .from('my_proof_items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    if ((count ?? 0) >= 10) {
      return NextResponse.json({ error: 'おすすめは最大10個までです' }, { status: 400 })
    }

    // professional型の場合: 投票済みか検証
    if (item_type === 'professional') {
      if (!professional_id) {
        return NextResponse.json({ error: 'professional_id is required' }, { status: 400 })
      }

      // votesテーブルで確認（client_user_idで紐づけ）
      const { data: vote } = await supabase
        .from('votes')
        .select('id')
        .eq('client_user_id', userId)
        .eq('professional_id', professional_id)
        .limit(1)
        .maybeSingle()

      if (!vote) {
        return NextResponse.json({ error: '投票済みのプロのみ追加できます' }, { status: 400 })
      }

      // 既に追加済みかチェック
      const { data: existing } = await supabase
        .from('my_proof_items')
        .select('id')
        .eq('user_id', userId)
        .eq('professional_id', professional_id)
        .maybeSingle()

      if (existing) {
        return NextResponse.json({ error: 'このプロは既に追加済みです' }, { status: 400 })
      }
    }

    // custom型の場合: title必須
    if (item_type === 'custom' && !title) {
      return NextResponse.json({ error: 'タイトルは必須です' }, { status: 400 })
    }

    // sort_orderは末尾に追加
    const nextOrder = (count ?? 0) + 1

    const { data, error } = await supabase
      .from('my_proof_items')
      .insert({
        user_id: userId,
        item_type,
        professional_id: item_type === 'professional' ? professional_id : null,
        title: item_type === 'custom' ? title : null,
        description: item_type === 'custom' ? (description || null) : null,
        photo_url: item_type === 'custom' ? (photo_url || null) : null,
        category: category || (item_type === 'professional' ? 'professional' : 'other'),
        sort_order: nextOrder,
      })
      .select()
      .maybeSingle()

    if (error) {
      console.error('[api/myproof/items] insert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ item: data })
  } catch (err: any) {
    console.error('[api/myproof/items] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
