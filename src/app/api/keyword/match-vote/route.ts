import { NextRequest, NextResponse } from 'next/server'
import { matchVoteComment } from '@/lib/keyword-matcher'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const voteId = typeof body?.voteId === 'string' ? body.voteId : ''

    if (!voteId) {
      return NextResponse.json(
        { error: 'voteId is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      )
    }

    const matched = await matchVoteComment(voteId)
    return NextResponse.json(
      { success: true, matched_count: matched },
      { headers: NO_STORE_HEADERS }
    )
  } catch (err) {
    console.error('[api/keyword/match-vote POST] error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json(
      { error: message },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
