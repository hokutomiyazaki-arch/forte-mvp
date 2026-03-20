import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { announcement_id } = await req.json()
  if (!announcement_id) {
    return NextResponse.json({ error: 'announcement_id is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // upsert: 重複時は何もしない（UNIQUE制約でON CONFLICTが使える）
  const { error } = await supabase
    .from('announcement_dismissals')
    .upsert(
      {
        announcement_id,
        user_id: userId,
        dismissed_at: new Date().toISOString(),
      },
      { onConflict: 'announcement_id,user_id' }
    )

  if (error) {
    console.error('[dismiss] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
