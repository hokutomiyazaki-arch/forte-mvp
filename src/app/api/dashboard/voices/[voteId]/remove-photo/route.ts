/**
 * ダッシュボード Voices タブ: 顔写真削除エンドポイント
 *
 * プロが自分の管理する Voice (= votes 行) の顔写真を削除する。
 * client_photo_url はハッシュチェーンに含まれないため、単純 UPDATE で OK。
 *
 *   client_photo_url: "https://lh3..."  →  null
 *   display_mode:     "photo"           →  "hidden"
 *
 * 認証: Clerk userId 必須。vote.professional_id が呼び出し元プロと一致しない場合は 403。
 */
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ voteId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      )
    }

    const { voteId } = await params
    if (!voteId || typeof voteId !== 'string') {
      return NextResponse.json(
        { error: 'voteId is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      )
    }

    const supabase = getSupabaseAdmin()

    const { data: pro, error: proErr } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', userId)
      .is('deactivated_at', null)
      .maybeSingle()
    if (proErr) throw proErr
    if (!pro) {
      return NextResponse.json(
        { error: 'Professional not found' },
        { status: 403, headers: NO_STORE_HEADERS }
      )
    }

    const { data: vote, error: voteErr } = await supabase
      .from('votes')
      .select('id, professional_id')
      .eq('id', voteId)
      .maybeSingle()
    if (voteErr) throw voteErr
    if (!vote) {
      return NextResponse.json(
        { error: 'Vote not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      )
    }
    if (vote.professional_id !== pro.id) {
      return NextResponse.json(
        { error: 'Not the owner of this vote' },
        { status: 403, headers: NO_STORE_HEADERS }
      )
    }

    const { error: updErr } = await supabase
      .from('votes')
      .update({
        client_photo_url: null,
        display_mode: 'hidden',
        updated_at: new Date().toISOString(),
      })
      .eq('id', voteId)
    if (updErr) throw updErr

    return NextResponse.json(
      { success: true, voteId, message: '写真を削除しました' },
      { headers: NO_STORE_HEADERS }
    )
  } catch (err) {
    console.error('[api/dashboard/voices/[voteId]/remove-photo POST] error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json(
      { error: message },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
