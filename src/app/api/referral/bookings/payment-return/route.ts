/**
 * GET /api/referral/bookings/payment-return?session_id=...
 *
 * §2-4ステージ3(予約フィー方式): Webhook未設定期間・配信遅延の二重の安全のためのフォールバック検証。
 * クライアントがCheckout成功URL(?payment=success&session_id=...)から戻ってきた際に1回呼ぶ。
 * StripeからSessionを取得し、webhookと同じ共通処理(applyReferralCheckoutSession)を
 * 冪等に実行する(webhookが先に処理済みでも二重通知しない)。
 *
 * キャンセルURL経由の戻り(`payment=canceled`)ではこのAPIを呼ばない(PaymentStatusBanner側で
 * 固定文言のみ表示する)。予約フィー方式では確認すべきdraft行が無く、支払いをやめても
 * payment_status='awaiting'のまま保持され、24時間の期限はcronが判定するため、
 * ここで能動的に何かを閉じる必要が無い。
 *
 * レスポンスはstatusのみ(連絡先・PIIは一切含めない)。
 */
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { applyReferralCheckoutSession } from '@/lib/referral-payment'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id') || ''
  const secret = process.env.REFERRAL_STRIPE_SECRET_KEY

  if (!secret || !sessionId) {
    return NextResponse.json({ status: 'pending' })
  }

  try {
    const stripe = new Stripe(secret)
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const result = await applyReferralCheckoutSession(session)
    const status = result === 'paid' ? 'paid' : 'pending'
    return NextResponse.json({ status })
  } catch (err) {
    console.error('[api/referral/bookings/payment-return] error:', err)
    return NextResponse.json({ status: 'pending' })
  }
}
