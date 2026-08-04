import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateFeePaymentLink } from '@/lib/referral-payment'

export const dynamic = 'force-dynamic'

/**
 * POST /api/referral/bookings/[booking_id]/payment-link
 *
 * バグ報告(2026-08-04・CEO): 決済(Stripe Checkout)を中断すると再開導線が無い問題への対応。
 * /booking/[booking_id](認証不要・秘匿URL)の「お支払いに進む」ボタンから呼ばれる。
 * メールは再送しない(画面遷移用のURL取得のみ)。レスポンスは checkout_url のみ・PIIは含めない。
 *
 * Stripeロジックは src/lib/referral-payment.ts の getOrCreateFeePaymentLink に集約し、
 * このAPI routeにはStripeのimportを持たせない(Webpackチャンクグラフ対策)。
 */
export async function POST(_request: NextRequest, { params }: { params: { booking_id: string } }) {
  try {
    const bookingId = params.booking_id
    if (!bookingId) {
      return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
    }

    const result = await getOrCreateFeePaymentLink(bookingId)

    if (result.outcome === 'ok') {
      return NextResponse.json({ checkout_url: result.checkoutUrl })
    }
    if (result.outcome === 'not_found') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (result.outcome === 'not_awaiting') {
      // レビュー指摘(軽微9): 内部payment_statusの生値を外に出さない。paidの時だけstatusを付与する2形に絞る。
      if (result.paymentStatus === 'paid') {
        return NextResponse.json({ error: 'not_awaiting', status: 'paid' }, { status: 409 })
      }
      return NextResponse.json({ error: 'not_awaiting' }, { status: 409 })
    }
    return NextResponse.json({ error: 'link_unavailable' }, { status: 500 })
  } catch (err: any) {
    console.error('[api/referral/bookings/[booking_id]/payment-link] error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
