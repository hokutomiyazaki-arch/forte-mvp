import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const keywordId = url.searchParams.get('keyword_id') || ''
    const category = url.searchParams.get('category') || 'multi'
    const sub = url.searchParams.get('sub') || 'rising'
    const prefecture = url.searchParams.get('prefecture') || ''

    if (!keywordId) {
      return NextResponse.json(
        { error: 'keyword_id is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      )
    }

    const supabase = getSupabaseAdmin()

    const { data: kwRow, error: kwErr } = await supabase
      .from('keywords')
      .select('name, synonyms')
      .eq('id', keywordId)
      .maybeSingle()
    if (kwErr) {
      console.error('[by-keyword] keyword fetch error:', kwErr)
      return NextResponse.json(
        { error: kwErr.message },
        { status: 500, headers: NO_STORE_HEADERS }
      )
    }
    if (!kwRow) {
      return NextResponse.json(
        { error: 'keyword not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      )
    }
    const keywordName: string = (kwRow as { name: string }).name || ''
    const synonyms: string[] = ((kwRow as { synonyms: string[] | null }).synonyms || [])
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
    const matchedKeywords = [keywordName, ...synonyms].filter((s) => s.length > 0)

    const proIdSet = new Set<string>()
    const PAGE = 1000
    let offset = 0
    for (;;) {
      const { data, error } = await supabase
        .from('voice_keywords')
        .select('professional_id')
        .eq('keyword_id', keywordId)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) {
        console.error('[by-keyword] voice_keywords fetch error:', error)
        return NextResponse.json(
          { error: error.message },
          { status: 500, headers: NO_STORE_HEADERS }
        )
      }
      if (!data || data.length === 0) break
      for (const r of data as { professional_id: string }[]) {
        proIdSet.add(r.professional_id)
      }
      if (data.length < PAGE) break
      offset += PAGE
    }

    if (proIdSet.size === 0) {
      return NextResponse.json(
        { professionals: [], total: 0, matchedKeywords },
        { headers: NO_STORE_HEADERS }
      )
    }

    const params = new URLSearchParams({ category, sub })
    if (prefecture) params.set('prefecture', prefecture)
    if (keywordName) params.set('q', keywordName)
    const searchUrl = `${url.origin}/api/search?${params.toString()}`

    const resp = await fetch(searchUrl, { cache: 'no-store' })
    if (!resp.ok) {
      const errMsg = `loopback /api/search failed: ${resp.status}`
      console.error('[by-keyword]', errMsg)
      return NextResponse.json(
        { error: errMsg },
        { status: 500, headers: NO_STORE_HEADERS }
      )
    }
    const searchData = await resp.json()
    const allPros = (searchData?.professionals || []) as Array<{ id: string }>

    const filtered = allPros.filter((p) => proIdSet.has(p.id))

    return NextResponse.json(
      { professionals: filtered, total: filtered.length, matchedKeywords },
      { headers: NO_STORE_HEADERS }
    )
  } catch (err) {
    console.error('[api/search/by-keyword GET] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
