import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { proofItemId } = await request.json()
    // proofItemId が null の場合はクリア
    if (proofItemId !== null && typeof proofItemId !== 'string') {
      return NextResponse.json({ error: 'Invalid proofItemId' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // 自分のプロレコードを取得
    const { data: pro, error: proError } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', userId)
      .is('deactivated_at', null)
      .maybeSingle()

    if (proError) throw proError
    if (!pro) {
      return NextResponse.json({ error: 'Professional not found' }, { status: 404 })
    }

    // featured_proof_id を更新
    const { error: updateError } = await supabase
      .from('professionals')
      .update({ featured_proof_id: proofItemId })
      .eq('id', pro.id)

    if (updateError) throw updateError

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[set-featured-proof] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
