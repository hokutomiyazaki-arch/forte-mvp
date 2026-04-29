/**
 * POST /api/deliver-reward
 *
 * vote_id を受け取り、reward-delivery.ts の deliverReward() を実行する
 * 配信トリガーエンドポイント。
 *
 * RewardOptinSection の onChange で fire-and-forget で叩かれる想定。
 * 内部で /api/send-reward-line → /api/send-reward-email の順で処理。
 *
 * 失敗してもクライアント UI はブロックしない (200 を返しつつ result に詳細を載せる)。
 */

import { NextRequest, NextResponse } from 'next/server'
import { deliverReward } from '@/lib/reward-delivery'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const vote_id = (body as any)?.vote_id
    if (!vote_id || typeof vote_id !== 'string') {
      return NextResponse.json(
        { error: 'vote_id is required' },
        { status: 400 }
      )
    }

    const result = await deliverReward(vote_id)
    return NextResponse.json({ success: true, result })
  } catch (err: any) {
    console.error('[deliver-reward] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', message: err?.message || String(err) },
      { status: 500 }
    )
  }
}
