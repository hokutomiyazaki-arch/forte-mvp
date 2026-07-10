/**
 * Stripe Webhook — NFCカード注文の記録 + 運営への通知メール
 *
 * POST /api/webhooks/card-order
 *
 * 既存の認定制度 Webhook（/api/stripe/webhook）とは別の新規エンドポイント。
 * 既存には一切手を入れず、専用の署名シークレット（STRIPE_CARD_ORDER_WEBHOOK_SECRET）で検証する。
 *
 * 前提（コード外・Stripe/Vercel 側の設定・北斗が実施）:
 * - Stripe ダッシュボードで本エンドポイントを Webhook 登録（イベント: checkout.session.completed）
 * - Vercel env + .env.local に STRIPE_CARD_ORDER_WEBHOOK_SECRET（whsec_...）を設定
 * - checkout セッションは /api/card-order/checkout で metadata.order_type='nfc_card' を付与済み
 *
 * 署名検証には生ボディが必要なため req.text() で読む（JSON parse しない）。
 * 冪等性: card_orders.stripe_session_id の UNIQUE 制約。重複配信で INSERT が衝突したら
 *         「処理済み」とみなして 200 を返し、通知メールは再送しない。
 */
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'
import { NFC_CARD_PRICE } from '@/lib/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOTIFY_TO = 'hokutomiyazaki312@gmail.com'

// 配送先住所を1行の読みやすい文字列に整形（通知メール用）
function formatAddress(addr: Stripe.Address | null | undefined): string {
  if (!addr) return '（住所情報なし）'
  const parts = [
    addr.postal_code ? `〒${addr.postal_code}` : '',
    addr.state ?? '',
    addr.city ?? '',
    addr.line1 ?? '',
    addr.line2 ?? '',
  ].filter(Boolean)
  return parts.join(' ')
}

async function sendNotification(params: {
  name: string
  email: string
  phone: string
  address: string
  registered: boolean
}) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.log('[card-order-webhook] No RESEND_API_KEY, skip notification')
    return
  }

  const status = params.registered ? '登録済み' : '未登録'
  const html = `
    <div style="max-width:520px;margin:0 auto;font-family:sans-serif;">
      <div style="background:#1A1A2E;padding:20px;border-radius:12px 12px 0 0;">
        <h1 style="color:#C4A35A;font-size:15px;margin:0;">REALPROOF — NFCカード注文</h1>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #eee;">
        <p style="color:#333;font-size:14px;">NFCカードの注文が入りました。</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#333;">
          <tr><td style="padding:8px 0;width:110px;color:#888;">氏名</td><td style="padding:8px 0;">${params.name || '（未入力）'}</td></tr>
          <tr><td style="padding:8px 0;color:#888;">メール</td><td style="padding:8px 0;">${params.email || '（未入力）'}</td></tr>
          <tr><td style="padding:8px 0;color:#888;">電話番号</td><td style="padding:8px 0;">${params.phone || '（未入力）'}</td></tr>
          <tr><td style="padding:8px 0;color:#888;vertical-align:top;">配送先</td><td style="padding:8px 0;">${params.address}</td></tr>
          <tr><td style="padding:8px 0;color:#888;">登録状況</td><td style="padding:8px 0;font-weight:bold;color:${params.registered ? '#1A1A2E' : '#C4A35A'};">${status}</td></tr>
        </table>
      </div>
    </div>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'REAL PROOF <noreply@realproof.jp>',
      to: NOTIFY_TO,
      subject: '【REALPROOF】NFCカード注文が入りました',
      html,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    console.error('[card-order-webhook] notification send failed:', res.status, errBody)
  } else {
    console.log('[card-order-webhook] notification sent')
  }
}

// 購入者への注文確認メール（送信専用・返信不可）。NFC設定ページへの導線を含める。
const CARD_SETUP_URL = 'https://realproof.jp/dashboard?tab=card'

async function sendPurchaserThankYou(params: { name: string; email: string }) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.log('[card-order-webhook] No RESEND_API_KEY, skip purchaser email')
    return
  }
  if (!params.email) {
    console.log('[card-order-webhook] no purchaser email, skip purchaser email')
    return
  }

  const greeting = params.name ? `${params.name} 様` : 'この度はありがとうございます'
  const html = `
    <div style="max-width:520px;margin:0 auto;font-family:sans-serif;">
      <div style="background:#1A1A2E;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="color:#C4A35A;font-size:16px;margin:0;letter-spacing:0.08em;">REAL PROOF</h1>
      </div>
      <div style="padding:28px 24px;background:#fff;border:1px solid #eee;color:#333;font-size:14px;line-height:1.9;">
        <p style="margin:0 0 16px;">${greeting}</p>
        <p style="margin:0 0 16px;">この度は REAL PROOF NFCカードをご注文いただきありがとうございます。ご注文を受け付けました（¥3,000／送料込み）。</p>
        <p style="margin:0 0 8px;font-weight:bold;color:#1A1A2E;">この先の流れ</p>
        <ol style="margin:0 0 20px;padding-left:20px;">
          <li style="margin-bottom:6px;">5営業日以内にカードを発送します。</li>
          <li style="margin-bottom:6px;">お手元に届いたら、下のページからログインし、カード裏面の番号（RP-◯◯◯）を入力してください。</li>
          <li>それだけでカードはあなた専用になり、その日からセッション現場で使えます。</li>
        </ol>
        <div style="text-align:center;margin:24px 0;">
          <a href="${CARD_SETUP_URL}" style="display:inline-block;background:#C4A35A;color:#1A1A2E;font-weight:bold;text-decoration:none;padding:14px 28px;border-radius:9999px;font-size:14px;">NFCカードを設定する →</a>
        </div>
        <p style="margin:0 0 4px;font-size:12px;color:#888;">ボタンが開かない場合は下のURLをブラウザに貼り付けてください：</p>
        <p style="margin:0 0 20px;font-size:12px;color:#888;word-break:break-all;">${CARD_SETUP_URL}</p>
        <p style="margin:0;font-size:12px;color:#aaa;">※ このメールは送信専用です。ご返信いただいてもお答えできません。</p>
      </div>
    </div>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'REAL PROOF <noreply@realproof.jp>',
      to: params.email,
      subject: '【REAL PROOF】ご注文ありがとうございます（NFCカード）',
      html,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    console.error('[card-order-webhook] purchaser email send failed:', res.status, errBody)
  } else {
    console.log('[card-order-webhook] purchaser email sent')
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_CARD_ORDER_WEBHOOK_SECRET
  if (!secret || !webhookSecret) {
    console.error('[card-order-webhook] STRIPE_SECRET_KEY / STRIPE_CARD_ORDER_WEBHOOK_SECRET not set')
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
    console.error('[card-order-webhook] signature verification failed:', msg)
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  // NFCカード注文の決済完了のみ処理。それ以外は 200 で素通り（Stripe の再送を防ぐ）。
  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object as Stripe.Checkout.Session
  if (session.metadata?.order_type !== 'nfc_card') {
    return NextResponse.json({ received: true })
  }
  // 未払い（後払い保留等）は記録しない
  if (session.payment_status !== 'paid') {
    console.log(`[card-order-webhook] session ${session.id} not paid (status=${session.payment_status}); skipped`)
    return NextResponse.json({ received: true })
  }

  const supabase = getSupabaseAdmin()

  // 収集値の取り出し（Stripe v22: 配送先は collected_information.shipping_details）
  const shipping = session.collected_information?.shipping_details ?? null
  const customer = session.customer_details ?? null
  const email = customer?.email ?? null
  const customerName = shipping?.name ?? customer?.name ?? null
  const phone = customer?.phone ?? ''
  const clerkUserId = (session.metadata?.clerk_user_id ?? '').trim() || null
  const paymentIntent =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null

  // professional_id 判定（未登録者判定用）: clerk userId → contact_email の順で突合
  let professionalId: string | null = null
  if (clerkUserId) {
    const { data } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', clerkUserId)
      .maybeSingle()
    if (data?.id) professionalId = String(data.id)
  }
  if (!professionalId && email) {
    const { data } = await supabase
      .from('professionals')
      .select('id')
      .eq('contact_email', email)
      .maybeSingle()
    if (data?.id) professionalId = String(data.id)
  }

  // INSERT（冪等性: stripe_session_id UNIQUE 衝突は「処理済み」として扱う）
  const { error } = await supabase.from('card_orders').insert({
    stripe_session_id: session.id,
    stripe_payment_intent: paymentIntent,
    email,
    customer_name: customerName,
    shipping_address: shipping, // { address, name } を丸ごと JSONB
    amount: session.amount_total ?? NFC_CARD_PRICE.amount,
    clerk_user_id: clerkUserId,
    professional_id: professionalId,
    status: 'paid',
  })

  if (error) {
    // 23505 = unique_violation（重複配信）。処理済みなので 200 でメール再送なし。
    if (error.code === '23505') {
      console.log(`[card-order-webhook] session ${session.id} already recorded; skip`)
      return NextResponse.json({ received: true })
    }
    console.error('[card-order-webhook] insert failed:', error.message)
    // 500 で返すと Stripe が再送 → 一時障害から回復できる
    return NextResponse.json({ error: 'insert failed' }, { status: 500 })
  }

  // 記録できた新規注文のみ通知（メール失敗は 200 のまま・注文記録は残す）
  try {
    await sendNotification({
      name: customerName ?? '',
      email: email ?? '',
      phone,
      address: formatAddress(shipping?.address),
      registered: professionalId !== null,
    })
  } catch (err) {
    console.error('[card-order-webhook] notification error:', err)
  }

  // 購入者への注文確認メール（NFC設定ページ導線つき）。失敗しても 200・注文記録は残す。
  try {
    await sendPurchaserThankYou({
      name: customerName ?? '',
      email: email ?? '',
    })
  } catch (err) {
    console.error('[card-order-webhook] purchaser email error:', err)
  }

  console.log(`[card-order-webhook] recorded order for session ${session.id} (registered=${professionalId !== null})`)
  return NextResponse.json({ received: true })
}
