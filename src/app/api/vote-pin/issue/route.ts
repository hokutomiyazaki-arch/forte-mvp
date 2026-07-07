import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/vote-pin/issue
 * オンラインセッション用の4桁投票PINを発行する。
 * - 発行者＝そのプロ本人（Clerk auth）であることを確認
 * - 既存の未使用PINを失効させてから、新しい4桁PINを1件INSERT
 * - 「新しく発行すると前の番号が使えなくなる」を担保する
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { professional_id } = body

    if (!professional_id) {
      return NextResponse.json({ error: 'professional_id required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // 発行者＝本人チェック: このプロが Clerk userId 本人のものか確認
    const { data: pro } = await supabase
      .from('professionals')
      .select('id')
      .eq('id', professional_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (!pro) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const nowIso = new Date().toISOString()
    // 保険として 24 時間で失効
    const expiresIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    // 1. このプロの未使用PINを全て失効（expires_at = now()）
    const { error: expireError } = await supabase
      .from('vote_pins')
      .update({ expires_at: nowIso })
      .eq('professional_id', professional_id)
      .is('used_at', null)

    if (expireError) {
      console.error('[api/vote-pin/issue] expire error:', expireError.message)
      return NextResponse.json({ error: expireError.message }, { status: 500 })
    }

    // 2. 4桁PIN（0000〜9999 のゼロ埋め文字列）を生成
    const pin = Math.floor(Math.random() * 10000).toString().padStart(4, '0')

    // 3. 新規INSERT
    const { error: insertError } = await supabase
      .from('vote_pins')
      .insert({
        professional_id,
        pin,
        expires_at: expiresIso,
      })

    if (insertError) {
      console.error('[api/vote-pin/issue] insert error:', insertError.message)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ pin })
  } catch (err: any) {
    console.error('[api/vote-pin/issue] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
