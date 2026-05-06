import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export type ChipItem = {
  id: string
  name: string
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const category = url.searchParams.get('category') || 'multi'
    const sub = url.searchParams.get('sub') || 'rising'
    const prefecture = url.searchParams.get('prefecture') || ''

    const supabase = getSupabaseAdmin()

    const { data: kwRows, error: kwErr } = await supabase
      .from('keywords')
      .select('id, name')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (kwErr) {
      console.error('[keyword-chips] keywords fetch error:', kwErr)
      return NextResponse.json(
        { error: kwErr.message },
        { status: 500, headers: NO_STORE_HEADERS }
      )
    }

    const params = new URLSearchParams({ category, sub })
    if (prefecture) params.set('prefecture', prefecture)
    const searchUrl = `${url.origin}/api/search?${params.toString()}`

    const resp = await fetch(searchUrl, { cache: 'no-store' })
    if (!resp.ok) {
      const errMsg = `loopback /api/search failed: ${resp.status}`
      console.error('[keyword-chips]', errMsg)
      return NextResponse.json(
        { error: errMsg },
        { status: 500, headers: NO_STORE_HEADERS }
      )
    }
    const searchData = await resp.json()
    const filteredProIds = (
      (searchData?.professionals || []) as Array<{ id: string }>
    ).map((p) => p.id)

    if (filteredProIds.length === 0) {
      return NextResponse.json({ chips: [] }, { headers: NO_STORE_HEADERS })
    }

    const counts = new Map<string, number>()
    const PAGE = 1000
    let offset = 0
    for (;;) {
      const { data, error } = await supabase
        .from('voice_keywords')
        .select('keyword_id')
        .in('professional_id', filteredProIds)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) {
        console.error('[keyword-chips] voice_keywords fetch error:', error)
        return NextResponse.json(
          { error: error.message },
          { status: 500, headers: NO_STORE_HEADERS }
        )
      }
      if (!data || data.length === 0) break
      for (const r of data as { keyword_id: string }[]) {
        counts.set(r.keyword_id, (counts.get(r.keyword_id) || 0) + 1)
      }
      if (data.length < PAGE) break
      offset += PAGE
    }

    const chips: ChipItem[] = []
    for (const k of (kwRows || []) as Array<{ id: string; name: string }>) {
      if ((counts.get(k.id) || 0) > 0) {
        chips.push({ id: k.id, name: k.name })
      }
    }

    return NextResponse.json({ chips }, { headers: NO_STORE_HEADERS })
  } catch (err) {
    console.error('[api/search/keyword-chips GET] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
