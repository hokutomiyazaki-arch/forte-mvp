/**
 * GET /api/referral/bookings/payment-return?session_id=...
 *
 * §2-4ステージ2: Webhook未設定期間・配信遅延の二重の安全のためのフォールバック検証。
 * クライアントがCheckout成功URL(?payment=success&session_id=...)またはキャンセルURL
 * (?payment=canceled&session_id=...)に戻ってきた際に1回呼ぶ。
 * StripeからSessionを取得し、webhookと同じ共通処理(applyReferralCheckoutSession)を
 * 冪等に実行する(webhookが先に処理済みでも二重通知しない)。
 *
 * 重大3補完: cancel_url経由の戻り時(`intent=cancel`)、ブラウザバック等でCheckout Sessionが
 * まだ'open'のまま(Stripe側の自動失効がまだ走っていない)ことがある。その場合のみ明示的に
 * sessions.expire()を呼んでからapplyReferralCheckoutSessionに渡す(draft行を確実にcancelled化する)。
 * 軽微指摘: success戻り(`intent`無し)では絶対にexpireしない
 * (万一openのままでも客の支払い試行を殺さない・pending判定のみに留める)。
 *
 * レスポンスはstatusのみ(連絡先・PIIは一切含めない)。
 */
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { applyReferralCheckoutSession } from '@/lib/referral-payment'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id') || ''
  const isCancelIntent = req.nextUrl.searchParams.get('intent') === 'cancel'
  const secret = process.env.REFERRAL_STRIPE_SECRET_KEY

  if (!secret || !sessionId) {
    return NextResponse.json({ status: 'pending' })
  }

  try {
    const stripe = new Stripe(secret)
    let session = await stripe.checkout.sessions.retrieve(sessionId)

    // キャンセル戻りの時だけ明示的に失効させる(success戻りでは支払い試行中の可能性を殺さない)
    if (isCancelIntent && session.status === 'open') {
      try {
        session = await stripe.checkout.sessions.expire(sessionId)
      } catch (expireErr) {
        console.error('[api/referral/bookings/payment-return] session expire error:', expireErr)
      }
    }

    const result = await applyReferralCheckoutSession(session)
    const status = result === 'authorized' || result === 'canceled' ? result : 'pending'
    return NextResponse.json({ status })
  } catch (err) {
    console.error('[api/referral/bookings/payment-return] error:', err)
    return NextResponse.json({ status: 'pending' })
  }
}
