import { NextResponse } from 'next/server'
import { getOwnPro } from '@/lib/referral-auth'
import { getConnectStatus } from '@/lib/referral-payment'
import { isReferralEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

/**
 * GET /api/referral/connect/status
 * ステージ4「Stripe Connect 口座登録導線」: 送り手プロの受け取り口座登録状況を返す。
 * { status: 'none' | 'pending' | 'reviewing' | 'enabled' }
 * 040未反映の環境は503 not_ready(UI側は「準備中」表示にフォールバック)。
 *
 * レビュー指摘(重大1): 既存 lists/route.ts のパターンを踏襲し isReferralEnabled で403ガードする。
 */
export async function GET() {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!isReferralEnabled(ownPro.id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const result = await getConnectStatus(ownPro.id)

    if (result.outcome === 'not_ready') {
      return NextResponse.json({ error: 'not_ready' }, { status: 503 })
    }
    if (result.outcome === 'error') {
      return NextResponse.json({ error: 'failed_to_fetch' }, { status: 500 })
    }

    return NextResponse.json({ status: result.status })
  } catch (err: any) {
    console.error('[api/referral/connect/status] GET error:', err)
    return NextResponse.json({ error: err?.message || 'internal_error' }, { status: 500 })
  }
}
