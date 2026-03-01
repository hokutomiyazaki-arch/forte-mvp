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
      .from('clients')
      .select('nickname, date_of_birth, photo_url')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('[api/client/profile] GET error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ profile: data || { nickname: '', date_of_birth: null, photo_url: null } })
  } catch (err: any) {
    console.error('[api/client/profile] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const body = await request.json()
    const { nickname, date_of_birth, photo_url } = body

    const updateData: Record<string, any> = {}
    if (nickname !== undefined) updateData.nickname = nickname
    if (date_of_birth !== undefined) updateData.date_of_birth = date_of_birth
    if (photo_url !== undefined) updateData.photo_url = photo_url

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('user_id', userId)

    if (error) {
      console.error('[api/client/profile] PUT error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[api/client/profile] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
