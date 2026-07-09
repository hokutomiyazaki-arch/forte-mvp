import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Stripe from 'stripe'
import { NFC_CARD_PRICE } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/**
 * POST /api/card-order/checkout
 * NFCカード（¥3,000・送料込み）の Stripe Checkout Session を生成する。
 *
 * - 誰でも購入可能（未ログインでもエラーにしない）。ログイン済みなら Clerk userId を metadata に載せ、
 *   Webhook 側で professionals との突合（未登録者判定）に使う。
 * - 金額はクライアントを信用せず NFC_CARD_PRICE（サーバー定義）を使う。
 * - 配送先住所（JP）と電話番号を Stripe 側で収集する。
 */
export async function POST() {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    console.error('[card-order/checkout] STRIPE_SECRET_KEY not set')
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  // 未ログインでも購入可。userId は取れれば載せる（取れなくてもエラーにしない）
  let userId: string | null = null
  try {
    const a = await auth()
    userId = a.userId
  } catch {
    userId = null
  }

  const stripe = new Stripe(secret)

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: { name: 'REALPROOF NFCカード（送料込み）' },
            unit_amount: NFC_CARD_PRICE.amount, // JPYはゼロ小数通貨。円の額面をそのまま
          },
          quantity: 1,
        },
      ],
      shipping_address_collection: { allowed_countries: ['JP'] },
      phone_number_collection: { enabled: true },
      metadata: {
        order_type: 'nfc_card',
        clerk_user_id: userId ?? '',
      },
      success_url: 'https://realproof.jp/nfc-card/thanks',
      cancel_url: 'https://realproof.jp/nfc-card',
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[card-order/checkout] session create failed:', msg)
    return NextResponse.json({ error: 'checkout failed' }, { status: 500 })
  }
}
