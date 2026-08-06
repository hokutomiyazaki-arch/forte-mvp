/**
 * Stripe Webhook — 紹介予約の予約フィー決済結果（§2-4ステージ3・予約フィー方式）
 *
 * POST /api/webhooks/referral-booking
 *
 * ★ リフェラル決済は既存のNFCカード/認定制度とは専用の別Stripeアカウント。
 *   既存の STRIPE_SECRET_KEY 系には一切触れず、REFERRAL_STRIPE_SECRET_KEY /
 *   REFERRAL_STRIPE_WEBHOOK_SECRET で検証する（既存webhookの署名検証パターンを踏襲）。
 *
 * 前提（コード外・Stripe/Vercel側の設定・北斗が実施）:
 * - Stripeダッシュボード（リフェラル専用アカウント）で本エンドポイントをWebhook登録
 *   （イベント: checkout.session.completed, checkout.session.expired,
 *    charge.refunded, charge.dispute.created）
 * - Vercel env + .env.local に REFERRAL_STRIPE_SECRET_KEY / REFERRAL_STRIPE_WEBHOOK_SECRET を設定
 * - migration 036（referral_bookings.stripe_checkout_session_id / payment_status）を実行済みであること
 *
 * 署名検証には生ボディが必要なため req.text() で読む（JSON parseしない）。
 * DB反映・冪等性・通知は src/lib/referral-payment.ts の applyReferralCheckoutSession に集約
 * （戻りURL側のフォールバック検証 payment-return と同じ関数を使う）。
 * checkout.session.expired は明示的に何もしない(payment_statusは'awaiting'のまま保持し、
 * 24時間の支払い期限判定はcron(expire-referral-bookings)に委ねる)。
 *
 * charge.refunded / charge.dispute.created（CEO最優先指示・2026-08-06・返金時の送金自動停止・副軸）:
 * REFERRAL_STRIPE_WEBHOOK_SECRET が未設定の間は本エンドポイント自体が500で素通りし届かないため、
 * 主軸(executeReferralPayoutTransferの送金直前チェック)がガードの本体。このハンドラは将来
 * シークレットが設定された時点で早期検知として効く（同じDB反映は
 * handleReferralRefundOrDisputeEvent に集約・冪等）。
 */
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { applyReferralCheckoutSession, extractPaymentIntentId, handleReferralRefundOrDisputeEvent } from '@/lib/referral-payment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = process.env.REFERRAL_STRIPE_SECRET_KEY
  const webhookSecret = process.env.REFERRAL_STRIPE_WEBHOOK_SECRET
  if (!secret || !webhookSecret) {
    console.error('[webhooks/referral-booking] REFERRAL_STRIPE_SECRET_KEY / REFERRAL_STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'webhook not configured' }, { status: 500 })
  }

  const stripe = new Stripe(secret)
  const rawBody = await req.text()
  const signature = req.headers.get('stripe-signature') || ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[webhooks/referral-booking] signature verification failed:', msg)
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  // 返金/争議検知(副軸): payment_intentからbookingを逆引きしてpayoutを止める(冪等)。
  if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
    try {
      const paymentIntentId =
        event.type === 'charge.refunded'
          ? extractPaymentIntentId((event.data.object as Stripe.Charge).payment_intent)
          : extractPaymentIntentId((event.data.object as Stripe.Dispute).payment_intent)
      if (paymentIntentId) {
        await handleReferralRefundOrDisputeEvent(paymentIntentId, event.type === 'charge.dispute.created')
      }
    } catch (err) {
      console.error('[webhooks/referral-booking] refund/dispute handling error:', err)
      // 500で返すとStripeが再送 → 一時障害から回復できる
      return NextResponse.json({ error: 'internal error' }, { status: 500 })
    }
    return NextResponse.json({ received: true })
  }

  // オーソリ完了 / セッション失効(未オーソリのまま放置)のみ処理。それ以外は200で素通り(Stripeの再送を防ぐ)。
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.expired') {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object as Stripe.Checkout.Session
  if (!session.metadata?.booking_id) {
    // このエンドポイントは紹介予約のオーソリ専用。booking_idが無いセッションは対象外。
    return NextResponse.json({ received: true })
  }

  try {
    const result = await applyReferralCheckoutSession(session)
    console.log(`[webhooks/referral-booking] session ${session.id} -> ${result}`)
  } catch (err) {
    console.error('[webhooks/referral-booking] apply error:', err)
    // 500で返すとStripeが再送 → 一時障害から回復できる
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
