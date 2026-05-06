import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export type ChipCategory = 'concern' | 'goal' | 'posture' | 'target' | 'method'
export type ChipSectionType = 'voice' | 'method'

export type ChipItem = {
  id: string
  name: string
  count: number
}

export type ChipSection = {
  category: ChipCategory
  section_type: ChipSectionType
  label: string
  chips: ChipItem[]
}

const CATEGORY_LABELS: Record<ChipCategory, string> = {
  concern: '悩みから探す',
  goal: '目的から探す',
  posture: '体型悩み',
  target: 'こんな人向け',
  method: '手法から探す',
}

const CATEGORY_ORDER: ChipCategory[] = ['concern', 'goal', 'posture', 'target', 'method']
const MIN_CHIPS_PER_SECTION = 2

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const { data: kwRows, error: kwErr } = await supabase
      .from('keywords')
      .select('id, name, category, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (kwErr) {
      console.error('[keyword-chips] keywords fetch error:', kwErr)
      return NextResponse.json(
        { error: kwErr.message },
        { status: 500, headers: NO_STORE_HEADERS }
      )
    }

    const counts = new Map<string, number>()
    const PAGE = 1000
    let offset = 0
    for (;;) {
      const { data, error } = await supabase
        .from('voice_keywords')
        .select('keyword_id')
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

    type Bucket = { id: string; name: string; count: number; display_order: number }
    const grouped = new Map<ChipCategory, Bucket[]>()
    for (const k of (kwRows || []) as Array<{
      id: string
      name: string
      category: ChipCategory
      display_order: number
    }>) {
      const c = counts.get(k.id) || 0
      if (c === 0) continue
      const arr = grouped.get(k.category) || []
      arr.push({ id: k.id, name: k.name, count: c, display_order: k.display_order })
      grouped.set(k.category, arr)
    }

    const sections: ChipSection[] = []
    for (const cat of CATEGORY_ORDER) {
      const arr = grouped.get(cat)
      if (!arr || arr.length < MIN_CHIPS_PER_SECTION) continue
      arr.sort((a, b) => b.count - a.count || a.display_order - b.display_order)
      sections.push({
        category: cat,
        section_type: cat === 'method' ? 'method' : 'voice',
        label: CATEGORY_LABELS[cat],
        chips: arr.map((x) => ({ id: x.id, name: x.name, count: x.count })),
      })
    }

    return NextResponse.json({ sections }, { headers: NO_STORE_HEADERS })
  } catch (err) {
    console.error('[api/search/keyword-chips GET] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
