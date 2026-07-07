/**
 * Stripe Webhook — 認定申請グループの入金自動消込
 *
 * POST /api/stripe/webhook
 *
 * checkout.session.completed（決済完了）を受信し、署名検証のうえ
 * metadata.application_group_id のグループを payment_status='paid' に更新する。
 * これまで運営が手動で入金確認していた工程を自動化する。
 *
 * 前提（コード外・Stripe/Vercel 側の設定）:
 * - Stripe ダッシュボードで本エンドポイントを Webhook 登録（イベント: checkout.session.completed）
 * - Vercel env に STRIPE_WEBHOOK_SECRET（署名シークレット whsec_...）と STRIPE_SECRET_KEY を設定
 * - checkout セッションは /api/certification/checkout で metadata.application_group_id を付与済み
 *
 * 署名検証には「生のリクエストボディ」が必要なため req.text() で読む（JSON parse しない）。
 * 冪等性: pending 行のみ paid に更新するため、同一イベントの複数回発火でも二重処理にならない。
 */
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !webhookSecret) {
    console.error('[stripe-webhook] STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Stripe webhook not configured' }, { status: 500 })
  }

  const stripe = new Stripe(secret)
  const rawBody = await req.text()
  const signature = req.headers.get('stripe-signature') || ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[stripe-webhook] signature verification failed:', msg)
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  // 決済完了のみ処理。それ以外のイベントは 2xx を返して素通り（Stripe の再送を防ぐ）。
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const groupId = session.metadata?.application_group_id ?? null

    // session.payment_status が 'paid' のときのみ消込（未払い/後払い分は対象外）
    if (session.payment_status === 'paid' && groupId) {
      const supabase = getSupabaseAdmin()
      const { data, error } = await supabase
        .from('certification_applications')
        .update({ payment_status: 'paid' })
        .eq('application_group_id', groupId)
        .eq('payment_status', 'pending') // 冪等性: 未消込分のみ
        .select('id')

      if (error) {
        console.error('[stripe-webhook] update failed:', error.message)
        // 500 を返すと Stripe が再送するため、一時障害でも後で回復できる
        return NextResponse.json({ error: 'update failed' }, { status: 500 })
      }
      console.log(`[stripe-webhook] group ${groupId} marked paid (${data?.length ?? 0} rows)`)
    } else if (groupId) {
      console.log(`[stripe-webhook] session for group ${groupId} not paid (status=${session.payment_status}); skipped`)
    } else {
      console.warn('[stripe-webhook] checkout.session.completed without application_group_id metadata; skipped')
    }
  }

  return NextResponse.json({ received: true })
}
