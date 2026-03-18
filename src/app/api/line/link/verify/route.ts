/**
 * LINE連携コード照合API
 *
 * POST /api/line/link/verify
 * Body: { professionalId: string, code: string }
 *
 * line_link_codes で照合し、一致すれば
 * professionals.line_messaging_user_id を更新して紐付け完了。
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

  const { professionalId, code } = body
  if (!professionalId || !code) {
    return NextResponse.json({ error: 'professionalId and code are required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // 所有者チェック
  const { data: pro } = await supabase
    .from('professionals')
    .select('id, user_id')
    .eq('id', professionalId)
    .maybeSingle()

  if (!pro || pro.user_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // status='waiting' かつ code一致 かつ 期限内のレコードを検索
  const { data: matched } = await supabase
    .from('line_link_codes')
    .select('id, line_user_id')
    .eq('professional_id', professionalId)
    .eq('status', 'waiting')
    .eq('code', code)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (matched && matched.line_user_id) {
    // 紐付け: professionals.line_messaging_user_id を更新
    const { error: updateError } = await supabase
      .from('professionals')
      .update({ line_messaging_user_id: matched.line_user_id })
      .eq('id', professionalId)

    if (updateError) {
      console.error('[line-link-verify] Update pro error:', updateError.message)
      return NextResponse.json({ success: false, error: 'update_failed' }, { status: 500 })
    }

    // line_link_codes を completed に
    await supabase
      .from('line_link_codes')
      .update({ status: 'completed' })
      .eq('id', matched.id)

    return NextResponse.json({ success: true })
  }

  // マッチしなかった場合: 原因を特定
  // pending レコードがあるか（まだ友達追加してない）
  const { data: pending } = await supabase
    .from('line_link_codes')
    .select('id')
    .eq('professional_id', professionalId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle()

  if (pending) {
    return NextResponse.json({ success: false, error: 'not_yet_added' })
  }

  // 期限切れチェック
  const { data: expired } = await supabase
    .from('line_link_codes')
    .select('id')
    .eq('professional_id', professionalId)
    .eq('code', code)
    .in('status', ['pending', 'waiting', 'expired'])
    .lte('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle()

  if (expired) {
    return NextResponse.json({ success: false, error: 'expired' })
  }

  // コード不一致
  return NextResponse.json({ success: false, error: 'invalid_code' })
}
