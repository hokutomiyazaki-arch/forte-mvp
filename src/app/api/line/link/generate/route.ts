/**
 * LINE連携コード発行API
 *
 * POST /api/line/link/generate
 * Body: { professionalId: string }
 *
 * 4桁コードを生成し、line_link_codes に保存。
 * 既存の pending/waiting レコードは expired に更新。
 * 再送時（line_user_idが既知）はpush messageで新コードを直接送信。
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

  // 既存のpending/waitingレコードからline_user_idを取得（expiredにする前に）
  const { data: existingRecord } = await supabase
    .from('line_link_codes')
    .select('line_user_id')
    .eq('professional_id', professionalId)
    .in('status', ['pending', 'waiting'])
    .not('line_user_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const existingLineUserId = existingRecord?.line_user_id || null

  // 既存の pending/waiting レコードを expired に
  await supabase
    .from('line_link_codes')
    .update({ status: 'expired' })
    .eq('professional_id', professionalId)
    .in('status', ['pending', 'waiting'])

  // 4桁コード生成
  const code = String(Math.floor(Math.random() * 10000)).padStart(4, '0')

  // INSERT: line_user_idがある場合はwaiting、なければpending
  const { data: inserted, error } = await supabase
    .from('line_link_codes')
    .insert({
      professional_id: professionalId,
      code,
      status: existingLineUserId ? 'waiting' : 'pending',
      ...(existingLineUserId ? { line_user_id: existingLineUserId } : {}),
    })
    .select('expires_at')
    .maybeSingle()

  if (error) {
    console.error('[line-link-generate] Insert error:', error.message)
    return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 })
  }

  // 既にline_user_idがわかっている場合はpush messageで新コードを送信
  let pushed = false
  if (existingLineUserId) {
    const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN
    if (accessToken) {
      try {
        const pushRes = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            to: existingLineUserId,
            messages: [{
              type: 'text',
              text: `新しい認証コード：${code}\nダッシュボードに戻って、このコードを入力してください。\n（5分間有効）`,
            }],
          }),
        })
        if (pushRes.ok) {
          pushed = true
        } else {
          console.error('[line-link-generate] Push message failed:', await pushRes.text())
        }
      } catch (e) {
        console.error('[line-link-generate] Push message error:', e)
      }
    }
  }

  return NextResponse.json({
    code,
    expiresAt: inserted?.expires_at,
    pushed,
  })
}
