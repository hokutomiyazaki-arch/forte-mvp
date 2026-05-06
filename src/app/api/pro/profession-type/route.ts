import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_TYPES = ['trainer', 'therapist', 'yoga', 'nutrition', 'other'] as const

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    const value = body?.profession_type
    if (typeof value !== 'string' || !ALLOWED_TYPES.includes(value as any)) {
      return NextResponse.json(
        { error: `profession_type は ${ALLOWED_TYPES.join(' / ')} のいずれかを指定してください` },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()

    const { data: pro } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', userId)
      .is('deactivated_at', null)
      .maybeSingle()

    if (!pro) {
      return NextResponse.json({ error: 'not_a_pro' }, { status: 403 })
    }

    const { data: updated, error } = await supabase
      .from('professionals')
      .update({ profession_type: value })
      .eq('id', pro.id)
      .select('id, profession_type')
      .maybeSingle()

    if (error) {
      console.error('[api/pro/profession-type PATCH] error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ profession_type: updated?.profession_type ?? null })
  } catch (err: any) {
    console.error('[api/pro/profession-type PATCH] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
