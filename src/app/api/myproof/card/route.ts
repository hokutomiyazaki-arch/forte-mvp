import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * PUT /api/myproof/card
 * タグライン更新
 */
export async function PUT(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { tagline, theme } = await request.json()

    // is_public: true を常にセット（既存カードのis_public=false/null対策）
    const updateData: Record<string, any> = { updated_at: new Date().toISOString(), is_public: true }
    if (tagline !== undefined) updateData.tagline = tagline
    if (theme !== undefined) updateData.theme = theme

    const { error } = await supabase
      .from('my_proof_cards')
      .update(updateData)
      .eq('user_id', userId)

    if (error) {
      console.error('[api/myproof/card] error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[api/myproof/card] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
