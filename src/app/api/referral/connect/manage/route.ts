import { NextResponse } from 'next/server'
import { getOwnPro } from '@/lib/referral-auth'
import { createConnectLoginLink } from '@/lib/referral-payment'
import { isReferralEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

/**
 * POST /api/referral/connect/manage
 * 口座管理導線(2026-08-05・CEO指示): 送り手プロが受け取り口座を変更・送金履歴を確認できるよう、
 * Stripe Express のホスト型ダッシュボードへのログインリンクを発行する。
 * onboard/route.tsと同じ規約(isReferralEnabledで403ガード・Stripeロジックはreferral-payment.tsに
 * 集約・レスポンスはurlのみ)を踏襲する。ログインリンクはワンタイムのためキャッシュしない
 * (毎回このrouteを叩いて新規発行する)。
 */
export async function POST() {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!isReferralEnabled(ownPro.id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const result = await createConnectLoginLink(ownPro.id)

    if (result.outcome === 'not_ready') {
      return NextResponse.json({ error: 'not_ready' }, { status: 503 })
    }
    if (result.outcome === 'no_account') {
      return NextResponse.json({ error: 'no_account' }, { status: 409 })
    }
    if (result.outcome === 'error') {
      return NextResponse.json({ error: 'failed_to_create_link' }, { status: 500 })
    }

    return NextResponse.json({ url: result.url })
  } catch (err: any) {
    console.error('[api/referral/connect/manage] POST error:', err)
    return NextResponse.json({ error: err?.message || 'internal_error' }, { status: 500 })
  }
}
