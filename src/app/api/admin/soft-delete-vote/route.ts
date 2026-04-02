import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { DELETED_MARKER } from '@/lib/proof-chain'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 管理者チェック
  const adminUserId = process.env.ADMIN_USER_ID
  if (userId !== adminUserId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { vote_id } = await request.json()
  if (!vote_id) {
    return NextResponse.json({ error: 'vote_id is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // ソフトデリート: 個人情報を消すがハッシュチェーンは維持
  const { error } = await supabase
    .from('votes')
    .update({
      voter_email: DELETED_MARKER,
      normalized_email: DELETED_MARKER,
      comment: DELETED_MARKER,
      auth_display_name: DELETED_MARKER,
      auth_provider_id: DELETED_MARKER,
      // proof_hash, prev_hash, proof_nonce は残す（チェーン維持）
      // professional_id, vote_type, selected_proof_ids, created_at も残す（集計に必要）
    })
    .eq('id', vote_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: 'Vote soft-deleted. Hash chain preserved.',
  })
}
