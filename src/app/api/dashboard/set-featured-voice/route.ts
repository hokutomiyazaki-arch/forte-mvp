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

    const { vote_id } = await request.json()
    // vote_id が null の場合はクリア
    if (vote_id !== null && typeof vote_id !== 'string') {
      return NextResponse.json({ error: 'Invalid vote_id' }, { status: 400 })
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

    // vote_id がある場合はそのvoteが自分のものか確認
    if (vote_id) {
      const { data: vote, error: voteError } = await supabase
        .from('votes')
        .select('id')
        .eq('id', vote_id)
        .eq('professional_id', pro.id)
        .maybeSingle()

      if (voteError) throw voteError
      if (!vote) {
        return NextResponse.json({ error: 'Vote not found' }, { status: 404 })
      }
    }

    // featured_vote_id を更新
    const { error: updateError } = await supabase
      .from('professionals')
      .update({ featured_vote_id: vote_id })
      .eq('id', pro.id)

    if (updateError) throw updateError

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[set-featured-voice] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
