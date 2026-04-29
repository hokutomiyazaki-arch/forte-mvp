/**
 * PATCH /api/votes/:id/reward-optin
 *
 * votes.reward_optin (BOOLEAN) を更新する。
 *   - 投票完了画面の RewardOptinSection からチェックボックス操作で呼ばれる
 *   - /unsubscribe ページからは reward_optin: false で呼ばれる
 *
 * 認可: 現状は vote_id を知っている誰でも更新可能 (Phase 1 の MVP 設計)。
 *       Phase 2 でトークン署名検証を追加する。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const voteId = params?.id
    if (!voteId) {
      return NextResponse.json({ error: 'vote id required' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const reward_optin = (body as any)?.reward_optin
    if (typeof reward_optin !== 'boolean') {
      return NextResponse.json(
        { error: 'reward_optin must be boolean' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await (supabase as any)
      .from('votes')
      .update({ reward_optin })
      .eq('id', voteId)
      .select('id, reward_optin')
      .maybeSingle()

    if (error) {
      console.error('[reward-optin] update error:', error)
      return NextResponse.json(
        { error: 'Update failed', details: error.message },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json({ error: 'Vote not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, vote: data })
  } catch (err: any) {
    console.error('[reward-optin] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', message: err?.message || String(err) },
      { status: 500 }
    )
  }
}
