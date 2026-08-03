/**
 * §2-4ステージ2: 相談リクエストのStripeオーソリ(与信確保)関連の共通処理(draft方式)。
 *
 * 設計(レビュー指摘・重大2/3/4により決定):
 * - 決済経路の予約は referral_bookings.status='draft' で作成する(オーソリ完了まで
 *   受け手一覧・重複チェック・48h失効・通知の対象外。すべて status='requested' 基準の
 *   既存クエリなので draft は自然に除外される)。
 * - オーソリ完了で 'draft' → 'requested' へ昇格し、そのタイミングで expires_at
 *   (48h)をセットする(与信確保からの48時間にする。draft作成時は未設定)。
 * - Stripe importはAPI route(bookings/cron)に持たせない(中1レビュー指摘・
 *   Webpackチャンクグラフ対策)。route側はこのファイルの関数を呼ぶだけにする。
 *
 * applyReferralCheckoutSession はWebhook(checkout.session.completed/expired)と、
 * 戻りURL側のフォールバック検証(payment-return)の両方から同じ関数を呼ぶ
 * (同じ判定ロジックを2箇所に書かない)。
 *
 * 冪等性(重大1): referral_bookings.status が 'draft' 以外(=既にrequested/cancelled等へ
 * 遷移済み)なら再処理・再通知しない。draft以外の行は絶対に更新しない。
 */
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'
import { notifyBookingRequested } from '@/lib/referral-notify'

/** draftからrequestedへ昇格した予約の新しい失効期限(オーソリ完了からの時間) */
const BOOKING_EXPIRES_HOURS = 48

function getReferralStripe(): Stripe {
  return new Stripe(process.env.REFERRAL_STRIPE_SECRET_KEY!)
}

function extractPaymentIntentId(pi: Stripe.Checkout.Session['payment_intent']): string | null {
  if (!pi) return null
  return typeof pi === 'string' ? pi : pi.id
}

function mapPaymentStatusToOutcome(paymentStatus: string | null | undefined): 'authorized' | 'pending' | 'canceled' {
  if (paymentStatus === 'authorized') return 'authorized'
  if (paymentStatus === 'canceled') return 'canceled'
  return 'pending'
}

/**
 * Stripe Checkout Session(オーソリのみ・manual capture)を作成する。
 * 例外・session.url無しはthrowせずnullを返す(呼び出し側でハンドリングしやすい形にする・中1指摘)。
 */
export async function createReferralCheckoutSession(params: {
  bookingId: string
  priceJpy: number
  menuName: string | null
  clientEmail: string
  successUrl: string
  cancelUrl: string
}): Promise<{ url: string; sessionId: string } | null> {
  try {
    const stripe = getReferralStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_intent_data: { capture_method: 'manual' },
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: { name: params.menuName || 'ご相談' },
            unit_amount: params.priceJpy,
          },
          quantity: 1,
        },
      ],
      customer_email: params.clientEmail,
      // PII注意: metadataにはbooking_idのみ(氏名・電話・メールは入れない)
      metadata: { booking_id: params.bookingId },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    })
    if (!session.url) return null
    return { url: session.url, sessionId: session.id }
  } catch (err) {
    console.error('[referral-payment] createReferralCheckoutSession error:', err)
    return null
  }
}

/**
 * オーソリ済み(与信確保済み)のPaymentIntentをキャンセルし与信を解放する。
 * 失敗はログのみ(呼び出し元は続行してよい。オーソリはStripe側で自然失効するため致命的でない)。
 */
export async function cancelReferralAuthorization(paymentIntentId: string): Promise<void> {
  try {
    const stripe = getReferralStripe()
    await stripe.paymentIntents.cancel(paymentIntentId)
  } catch (err) {
    console.error('[referral-payment] cancelReferralAuthorization error:', err)
  }
}

/**
 * オーソリ成功の判定を厳格化する(重大5レビュー指摘)。
 * - session.status === 'expired' → canceled
 * - session.status !== 'complete' → pending(未完了。判定しない)
 * - complete の場合のみ PaymentIntent を実際にretrieveし、
 *   status が 'requires_capture' | 'succeeded' の場合だけ authorized
 */
async function resolvePaymentOutcome(session: Stripe.Checkout.Session): Promise<'authorized' | 'pending' | 'canceled'> {
  if (session.status === 'expired') return 'canceled'
  if (session.status !== 'complete') return 'pending'

  const paymentIntentId = extractPaymentIntentId(session.payment_intent)
  if (!paymentIntentId) return 'pending'

  try {
    const stripe = getReferralStripe()
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
    if (pi.status === 'requires_capture' || pi.status === 'succeeded') return 'authorized'
    return 'pending'
  } catch (err) {
    console.error('[referral-payment] paymentIntents.retrieve error:', err)
    return 'pending'
  }
}

/** 競合(webhookとフォールバックの同時実行等)で更新0行だった場合、DBの実状態を再取得して返す(軽微2)。 */
async function currentOutcome(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  bookingId: string
): Promise<'authorized' | 'pending' | 'canceled'> {
  const { data: latest } = await supabase
    .from('referral_bookings')
    .select('payment_status')
    .eq('id', bookingId)
    .maybeSingle()
  return mapPaymentStatusToOutcome(latest?.payment_status)
}

/**
 * 重大指摘(二重与信の閉塞): 昇格を諦めてdraft行を閉じ、Stripe側の与信も解放する。
 * ①同一client_email×receiver_pro_idの既存requested/confirmedが見つかった場合(昇格直前の
 * 重複再検証)②昇格UPDATE自体がエラーになった場合(23505等) の両方から呼ぶ共通後始末。
 * 「エラーでpendingを返して与信を放置する」パスを残さないための唯一の出口にする。
 */
async function releaseAndCancelDraft(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  bookingId: string,
  session: Stripe.Checkout.Session
): Promise<void> {
  const paymentIntentId = extractPaymentIntentId(session.payment_intent)
  if (paymentIntentId) {
    await cancelReferralAuthorization(paymentIntentId)
  }
  const { error } = await supabase
    .from('referral_bookings')
    .update({ payment_status: 'canceled', status: 'cancelled' })
    .eq('id', bookingId)
    .eq('status', 'draft')
    .eq('payment_status', 'unpaid')
  if (error) {
    console.error('[referral-payment] releaseAndCancelDraft update failed:', error.message)
  }
}

/**
 * Stripe Checkout Session の状態を referral_bookings に反映する(draft方式)。
 */
export async function applyReferralCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<'authorized' | 'pending' | 'canceled' | 'not_found'> {
  const bookingId = session.metadata?.booking_id
  if (!bookingId) return 'not_found'

  const supabase = getSupabaseAdmin()
  const { data: booking } = await supabase
    .from('referral_bookings')
    .select('id, payment_status, status, receiver_pro_id, client_id, client_email')
    .eq('id', bookingId)
    .maybeSingle()

  if (!booking) return 'not_found'

  // 冪等(重大1・軽微2): draft以外(=既に昇格/失効済み)なら再処理・再通知せず、実状態を返す
  if (booking.status !== 'draft') {
    return mapPaymentStatusToOutcome(booking.payment_status)
  }

  const outcome = await resolvePaymentOutcome(session)
  if (outcome === 'pending') return 'pending'

  if (outcome === 'canceled') {
    const { data: updatedRows, error } = await supabase
      .from('referral_bookings')
      .update({ payment_status: 'canceled', status: 'cancelled' })
      .eq('id', bookingId)
      .eq('payment_status', 'unpaid')
      .eq('status', 'draft')
      .select('id')

    if (error) {
      console.error('[referral-payment] update to canceled failed:', error.message)
      return 'pending'
    }
    if (!updatedRows || updatedRows.length === 0) {
      return currentOutcome(supabase, bookingId)
    }
    return 'canceled'
  }

  // 重大指摘(二重与信の閉塞): 昇格直前に同一client_email×receiver_pro_idの
  // requested/confirmedが既に存在するかを再検証する(二重送信・複数タブでの多重チェックアウト等で
  // 2つのdraftが両方オーソリ完了するケース)。見つかった場合はこのsessionの与信を解放しdraftを閉じる。
  const { data: duplicateActiveRows } = await supabase
    .from('referral_bookings')
    .select('id')
    .eq('client_email', booking.client_email)
    .eq('receiver_pro_id', booking.receiver_pro_id)
    .in('status', ['requested', 'confirmed'])
    .neq('id', bookingId)
    .limit(1)

  if (duplicateActiveRows && duplicateActiveRows.length > 0) {
    await releaseAndCancelDraft(supabase, bookingId, session)
    return 'canceled'
  }

  // outcome === 'authorized' → draftからrequestedへ昇格。expires_atはここで初めてセットする
  // (オーソリ完了からの48時間。draft作成時は未設定)
  const paymentIntentId = extractPaymentIntentId(session.payment_intent)
  const expiresAt = new Date(Date.now() + BOOKING_EXPIRES_HOURS * 60 * 60 * 1000).toISOString()

  const { data: updatedRows, error } = await supabase
    .from('referral_bookings')
    .update({
      payment_status: 'authorized',
      stripe_payment_intent_id: paymentIntentId,
      status: 'requested',
      expires_at: expiresAt,
    })
    .eq('id', bookingId)
    .eq('payment_status', 'unpaid')
    .eq('status', 'draft')
    .select('id')

  if (error) {
    // 重大指摘: エラー(特に23505=UNIQUE違反。昇格の瞬間に別経路でrequestedが先に出来た等)で
    // 'pending'を返して与信を放置しない。PI解放+draft cancelled化まで必ず通す。
    console.error('[referral-payment] update to authorized failed:', error.message)
    await releaseAndCancelDraft(supabase, bookingId, session)
    return 'canceled'
  }
  if (!updatedRows || updatedRows.length === 0) {
    // 競合で既に他経路が処理済み(軽微2: 再SELECTして実状態を返す・通知は送らない)
    return currentOutcome(supabase, bookingId)
  }

  // オーソリ完了後に初めて受け手プロへ通知する(失敗しても決済処理自体は成功扱い)
  try {
    const { data: receiverPro } = await supabase
      .from('professionals')
      .select('name, contact_email, line_messaging_user_id')
      .eq('id', booking.receiver_pro_id)
      .maybeSingle()
    const { data: client } = await supabase
      .from('clients')
      .select('nickname')
      .eq('id', booking.client_id)
      .maybeSingle()
    if (receiverPro) {
      await notifyBookingRequested(
        {
          name: receiverPro.name,
          contact_email: receiverPro.contact_email,
          line_messaging_user_id: receiverPro.line_messaging_user_id,
        },
        client?.nickname || 'クライアント'
      )
    }
  } catch (notifyErr) {
    console.error('[referral-payment] notify error:', notifyErr)
  }

  return 'authorized'
}
