import { NextResponse } from 'next/server'
import { getOwnPro } from '@/lib/referral-auth'
import { createConnectOnboardingLink } from '@/lib/referral-payment'
import { isReferralEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

/**
 * POST /api/referral/connect/onboard
 * ステージ4「Stripe Connect 口座登録導線」(CEO承認済み・2026-08-04): 送り手プロが
 * 報酬受け取り用のStripe Express onboardingを開始/再開するためのリンクを発行する。
 * Stripeロジック(SDK import)は referral-payment.ts に集約する(このrouteは新規ファイルで
 * Webpackチャンクグラフの既存破壊リスクは無いが、Stripe呼び出しを1箇所に閉じる既存規約は
 * このroute側にも新規Stripe importを足さない形で維持する)。
 * 040(professionals.stripe_connect_account_id等)未反映の環境は503 not_ready を返し、
 * UI側は「準備中」表示にフォールバックする(fail-soft)。
 * レスポンスはurlのみ(Stripeの生エラー・account idはPII/内部識別子のため返さない)。
 *
 * レビュー指摘(重大1): アローリスト外プロが直叩きした場合にStripeアカウントが作られてしまう穴を
 * 閉じるため、既存 lists/route.ts のパターンを踏襲して isReferralEnabled で403ガードする。
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

    const result = await createConnectOnboardingLink(ownPro.id)

    if (result.outcome === 'not_ready') {
      return NextResponse.json({ error: 'not_ready' }, { status: 503 })
    }
    if (result.outcome === 'error') {
      return NextResponse.json({ error: 'failed_to_create_link' }, { status: 500 })
    }

    return NextResponse.json({ url: result.url })
  } catch (err: any) {
    console.error('[api/referral/connect/onboard] POST error:', err)
    return NextResponse.json({ error: err?.message || 'internal_error' }, { status: 500 })
  }
}
