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

    // 2-fetch UNION:
    //   fetch1 (q=name): literal hit プロ。matchedVoice/voiceMatchCount/profileMatchField が populate される
    //   fetch2 (q なし): 全プロ。synonym-only ヒットを救う(voice_keywords post-filter で絞る)
    // 結果 = fetch1 ∪ (fetch2 ∩ voice_keywords)・dedupe by id・fetch1 優先
    const baseParams = new URLSearchParams({ category, sub })
    if (prefecture) baseParams.set('prefecture', prefecture)

    const params1 = new URLSearchParams(baseParams)
    if (keywordName) params1.set('q', keywordName)
    const url1 = `${url.origin}/api/search?${params1.toString()}`
    const url2 = `${url.origin}/api/search?${baseParams.toString()}`

    const [resp1, resp2] = await Promise.all([
      fetch(url1, { cache: 'no-store' }),
      fetch(url2, { cache: 'no-store' }),
    ])
    if (!resp1.ok || !resp2.ok) {
      const errMsg = `loopback /api/search failed: ${resp1.status}/${resp2.status}`
      console.error('[by-keyword]', errMsg)
      return NextResponse.json(
        { error: errMsg },
        { status: 500, headers: NO_STORE_HEADERS }
      )
    }
    const [data1, data2] = await Promise.all([resp1.json(), resp2.json()])
    const pros1 = (data1?.professionals || []) as Array<{ id: string }>
    const pros2 = (data2?.professionals || []) as Array<{ id: string }>

    const fetch1IdSet = new Set(pros1.map((p) => p.id))
    const synonymOnly = pros2.filter(
      (p) => proIdSet.has(p.id) && !fetch1IdSet.has(p.id)
    )
    const merged = [...pros1, ...synonymOnly]

    return NextResponse.json(
      { professionals: merged, total: merged.length, matchedKeywords },
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
