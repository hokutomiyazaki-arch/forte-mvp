import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * PUT /api/myproof/items/reorder
 * アイテム並び替え
 */
export async function PUT(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { items } = await request.json()

    // items: [{ id: "xxx", sort_order: 1 }, ...]
    for (const item of items) {
      await supabase
        .from('my_proof_items')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id)
        .eq('user_id', userId)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[api/myproof/items/reorder] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
