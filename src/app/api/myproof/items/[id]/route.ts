import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * PUT /api/myproof/items/[id]
 * アイテム更新
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const supabase = getSupabaseAdmin()
    const body = await request.json()
    const { title, description, photo_url } = body

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (photo_url !== undefined) updateData.photo_url = photo_url

    const { error } = await supabase
      .from('my_proof_items')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      console.error('[api/myproof/items/[id]] PUT error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[api/myproof/items/[id]] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}

/**
 * DELETE /api/myproof/items/[id]
 * アイテム削除
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const supabase = getSupabaseAdmin()

    const { error } = await supabase
      .from('my_proof_items')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      console.error('[api/myproof/items/[id]] DELETE error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[api/myproof/items/[id]] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
