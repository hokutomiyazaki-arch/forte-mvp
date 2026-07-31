import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// §2-8 継続記録: 完了画面の「あなたの記録：◯回目」表示用。
// レスポンスは { count } のみ（メール等PIIは絶対に含めない）。

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function GET(request: NextRequest) {
  try {
    const voteId = request.nextUrl.searchParams.get('vote_id')
    if (!voteId) {
      return NextResponse.json({ error: 'vote_id is required' }, { status: 400, headers: NO_STORE_HEADERS })
    }

    const supabase = getSupabaseAdmin()

    const { data: vote } = await supabase
      .from('votes')
      .select('normalized_email, professional_id')
      .eq('id', voteId)
      .maybeSingle()

    if (!vote?.normalized_email || !vote?.professional_id) {
      return NextResponse.json({ count: 0 }, { headers: NO_STORE_HEADERS })
    }

    const { count } = await supabase
      .from('votes')
      .select('id', { count: 'exact', head: true })
      .eq('normalized_email', vote.normalized_email)
      .eq('professional_id', vote.professional_id)
      .eq('status', 'confirmed')

    return NextResponse.json({ count: count || 0 }, { headers: NO_STORE_HEADERS })
  } catch (err) {
    console.error('[api/vote-count GET] error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers: NO_STORE_HEADERS })
  }
}
