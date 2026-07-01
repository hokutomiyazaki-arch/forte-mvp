import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/certification/checkout
 * 認定申請グループ（application_group_id）の未払い分を Stripe Checkout（動的生成）で決済する。
 *
 * 金額はクライアントを信用せず、DB上の申請グループの payment_amount 合計をサーバーで再計算して line_item 化する。
 * PVC/金属/盾の任意組み合わせに対応（合計を1明細で作成）。Webhook自動消込は今回は無し（運営が入金確認）。
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    console.error('[certification/checkout] STRIPE_SECRET_KEY not set')
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  let applicationGroupId: string | null = null
  try {
    const body = await req.json()
    applicationGroupId = typeof body.applicationGroupId === 'string' ? body.applicationGroupId : null
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  if (!applicationGroupId) {
    return NextResponse.json({ error: 'applicationGroupId required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // 呼び出し元のプロを解決（所有権チェック用）
  const { data: pro } = await supabase
    .from('professionals')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (!pro) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 申請グループの行を取得（金額はサーバー側の値を使用）
  const { data: rows } = await supabase
    .from('certification_applications')
    .select('professional_id, payment_amount, payment_status')
    .eq('application_group_id', applicationGroupId)
  const groupRows = (rows as { professional_id: string; payment_amount: number | null; payment_status: string | null }[] | null) ?? []

  if (groupRows.length === 0) {
    return NextResponse.json({ error: 'group not found' }, { status: 404 })
  }
  // 所有権: 全行が呼び出し元プロのものであること
  if (groupRows.some((r) => String(r.professional_id) !== String(pro.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const total = groupRows.reduce((s, r) => s + (r.payment_amount || 0), 0)
  if (total <= 0) {
    return NextResponse.json({ error: 'no payment required' }, { status: 400 })
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://realproof.jp'
  const stripe = new Stripe(secret)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'jpy',
          product_data: { name: `REALPROOF認定 一式（${groupRows.length}項目）` },
          unit_amount: total, // JPYはゼロ小数通貨。円の額面をそのまま指定
        },
        quantity: 1,
      },
    ],
    success_url: `${site}/dashboard?cert_paid=1`,
    cancel_url: `${site}/dashboard?cert_cancel=1`,
    metadata: {
      application_group_id: applicationGroupId,
      professional_id: String(pro.id),
    },
  })

  return NextResponse.json({ url: session.url })
}
