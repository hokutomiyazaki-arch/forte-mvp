import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, created_at, professional_id, professionals(id, name, title, photo_url, prefecture, area_description)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[api/bookmarks] supabase error:', error)
      return NextResponse.json({ error: 'failed_to_fetch' }, { status: 500 })
    }

    return NextResponse.json({ bookmarks: data || [] })
  } catch (err: any) {
    console.error('[api/bookmarks] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
