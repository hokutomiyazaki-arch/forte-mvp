/**
 * ダッシュボード Voices タブ: コメント削除エンドポイント
 *
 * プロが自分の管理する Voice (= votes 行) のコメント本文を削除する。
 * comment はハッシュチェーン計算式に含まれるため、ソフトデリート方式を採用:
 *
 *   comment: "腰の痛みが…"  →  "[deleted]"
 *
 * voter_email / normalized_email は触らない (重複投票検知・クールダウンのため保持)。
 *
 * 検証 API (proof-chain.ts の verifyChain) は comment === DELETED_MARKER を
 * 検出してハッシュ再計算をスキップし、チェーンリンク (prev_hash) のみを検証する。
 *
 * 認証: Clerk userId 必須。vote.professional_id が呼び出し元プロと一致しない場合は 403。
 */
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { DELETED_MARKER } from '@/lib/proof-chain'

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
        comment: DELETED_MARKER,
        updated_at: new Date().toISOString(),
      })
      .eq('id', voteId)
    if (updErr) throw updErr

    return NextResponse.json(
      { success: true, voteId, message: 'コメントを削除しました' },
      { headers: NO_STORE_HEADERS }
    )
  } catch (err) {
    console.error('[api/dashboard/voices/[voteId]/remove-comment POST] error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json(
      { error: message },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
