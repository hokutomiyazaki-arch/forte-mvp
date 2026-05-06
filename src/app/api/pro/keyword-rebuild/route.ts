import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { deleteKeywordMatches, matchKeywordsAndStore } from '@/lib/keyword-matcher'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function POST() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      )
    }

    const supabase = getSupabaseAdmin()

    const { data: pro, error: proErr } = await supabase
      .from('professionals')
      .select('id, bio, title, store_name')
      .eq('user_id', userId)
      .is('deactivated_at', null)
      .maybeSingle()

    if (proErr) {
      console.error('[keyword-rebuild] pro lookup error:', proErr)
      return NextResponse.json(
        { error: proErr.message },
        { status: 500, headers: NO_STORE_HEADERS }
      )
    }
    if (!pro) {
      return NextResponse.json(
        { error: 'Professional not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      )
    }

    const text = [pro.bio, pro.title, pro.store_name]
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
      .join(' ')

    await deleteKeywordMatches('profile_method', pro.id)
    const matched = await matchKeywordsAndStore(pro.id, text, 'profile_method', pro.id)

    return NextResponse.json(
      { success: true, matched_count: matched },
      { headers: NO_STORE_HEADERS }
    )
  } catch (err) {
    console.error('[api/pro/keyword-rebuild POST] error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json(
      { error: message },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
