/**
 * LINE連携コード発行API
 *
 * POST /api/line/link/generate
 * Body: { professionalId: string }
 *
 * 4桁コードを生成し、line_link_codes に保存。
 * 既存の pending/waiting レコードは expired に更新。
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { professionalId } = body
  if (!professionalId) {
    return NextResponse.json({ error: 'professionalId is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // 所有者チェック: ログイン中のユーザーがこのプロの所有者か
  const { data: pro } = await supabase
    .from('professionals')
    .select('id, user_id')
    .eq('id', professionalId)
    .maybeSingle()

  if (!pro || pro.user_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 既存の pending/waiting レコードを expired に
  await supabase
    .from('line_link_codes')
    .update({ status: 'expired' })
    .eq('professional_id', professionalId)
    .in('status', ['pending', 'waiting'])

  // 4桁コード生成
  const code = String(Math.floor(Math.random() * 10000)).padStart(4, '0')

  // INSERT
  const { data: inserted, error } = await supabase
    .from('line_link_codes')
    .insert({
      professional_id: professionalId,
      code,
      status: 'pending',
    })
    .select('expires_at')
    .maybeSingle()

  if (error) {
    console.error('[line-link-generate] Insert error:', error.message)
    return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 })
  }

  return NextResponse.json({
    code,
    expiresAt: inserted?.expires_at,
  })
}
