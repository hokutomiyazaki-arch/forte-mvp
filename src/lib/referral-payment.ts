/**
 * §2-4ステージ3: 「予約フィー方式×確定時決済」の共通処理(CEO決定・設計変更)。
 *
 * 設計(旧ステージ2のオーソリ・draft方式から刷新):
 * - 相談送信(bookings POST)時は決済を挟まない(従来の無決済フローに戻す)。
 * - 受け手プロが日時を確定(received PATCH confirm)した時点で、予約フィー
 *   (fee_amount = price_jpy * fee_total_bps / 10000)のみのStripe Checkoutを作成する。
 *   capture_methodは指定しない(=即時キャプチャ。オーソリの7日失効を避けるため持ち越さない)。
 * - 支払い完了(checkout.session.completed かつ session.payment_status==='paid')で
 *   referral_bookings.payment_status を 'unpaid'|'awaiting' → 'paid' に更新し、
 *   その時点で「予約成立」として受け手・送り手・クライアントの3者へ通知する。
 * - draft方式・与信キャンセルの昇格ロジックは撤去(draftはもう作られない。既存draft行は
 *   cron側の掃除ブロックがそのまま回収する)。
 *
 * applyReferralCheckoutSession はWebhook(checkout.session.completed/expired)と、
 * 戻りURL側のフォールバック検証(payment-return)の両方から同じ関数を呼ぶ
 * (同じ判定ロジックを2箇所に書かない)。
 *
 * issueFeePaymentLinkAndNotify は「決済リンク発行+メール送付」の共通処理(レビュー指摘・中1)。
 * 確定時(bookings/received PATCH confirm)と、confirmed×unpaidの取り残し再試行
 * (cron/expire-referral-bookings)の両方から同じ関数を呼ぶ(同じ処理を2箇所に書かない)。
 *
 * 冪等性: referral_bookings.payment_status が 'awaiting' 以外(=既にpaid/その他)なら
 * 再処理・再通知しない。
 */
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  notifyBookingConfirmedToSender,
  notifyBookingPaymentCompletedToReceiver,
  notifyClientByEmail,
  referralListFooterHtml,
  emailShell,
  escapeHtml,
  buildBookingLocationContactHtml,
  hasProLocationInfo,
  buildCalendarLinkHtml,
  buildRescheduleContactNoteHtml,
  notifyReferralPayoutTransferred,
} from '@/lib/referral-notify'
import { buildGoogleCalendarUrl, resolveConfirmedSlotIso, estimateReferralPayoutReflectionText } from '@/lib/referral-format'
import {
  REFERRAL_FEE_TOTAL_BPS,
  REFERRAL_MIN_FEE_JPY,
  CONFIRM_PAYMENT_DEADLINE_HOURS,
  REFERRAL_MAX_AUTO_TRANSFER_JPY,
  isReferralPaymentEnabled,
} from '@/lib/feature-flags'

const APP_URL = 'https://realproof.jp'

function getReferralStripe(): Stripe {
  return new Stripe(process.env.REFERRAL_STRIPE_SECRET_KEY!)
}

function extractPaymentIntentId(pi: Stripe.Checkout.Session['payment_intent']): string | null {
  if (!pi) return null
  return typeof pi === 'string' ? pi : pi.id
}

/**
 * Stripe Checkout Session(即時キャプチャ・予約フィー額のみ)を作成する。
 * 例外・session.url無しはthrowせずnullを返す(呼び出し側でハンドリングしやすい形にする)。
 * レビュー指摘(軽微1): clientEmailが空文字だとStripeがinvalid emailで弾くためoptionalにし、
 * 値がある場合のみcustomer_emailを付与する。
 */
export async function createReferralCheckoutSession(params: {
  bookingId: string
  amountJpy: number
  itemName: string
  clientEmail?: string
  successUrl: string
  cancelUrl: string
}): Promise<{ url: string; sessionId: string } | null> {
  try {
    const stripe = getReferralStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: { name: params.itemName },
            unit_amount: params.amountJpy,
          },
          quantity: 1,
        },
      ],
      ...(params.clientEmail ? { customer_email: params.clientEmail } : {}),
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
 * 死んだ(誰も支払えない)Checkout Sessionを明示的に失効させる。失敗はログのみ残し、
 * 呼び出し元には成功可否を boolean で返す(レビュー指摘・重大2: 呼び出し元が
 * 「失効を確認できた場合のみ次の処理へ進む」判断をできるようにする)。
 * 既存呼び出し元(issueFeePaymentLinkAndNotifyの失敗フォールバック、cronの24h支払い期限切れ
 * キャンセル)は戻り値を見ていないため、この変更で壊れない(Promise<void>→Promise<boolean>は
 * awaitのみの既存呼び出しと後方互換)。
 */
export async function expireReferralCheckoutSession(sessionId: string): Promise<boolean> {
  try {
    const stripe = getReferralStripe()
    await stripe.checkout.sessions.expire(sessionId)
    return true
  } catch (err) {
    console.error('[referral-payment] expireReferralCheckoutSession error:', err)
    return false
  }
}

/**
 * オーソリ(与信確保)済みのPaymentIntentをキャンセルする関数。
 * §2-4ステージ3(予約フィー方式への刷新)でオーソリ運用自体は廃止したため、現在このリポジトリ内に
 * 呼び出し元は無いが、将来与信キャンセルが必要になった場合のために関数のみ残す。
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
 * タスク②(CEO指示・2026-08-04): プロ都合キャンセル時、支払済みの予約金(fee)を全額返金する。
 * 呼び出し元(bookings/received PATCH cancel_by_receiver)は、UPDATEで status='cancelled' への
 * 遷移をCASで確定させた**後**にこの関数を呼ぶこと(二重返金防止・呼び出し順序を守る)。
 * 冪等性: Stripe側が既に返金済み(charge_already_refunded)の場合は成功扱いにする。
 * レビュー指摘(中2): 不可逆操作の保険として `refunds.create` にidempotencyKeyを付与する
 * (再試行(cron等)で同一bookingに対して二重に返金APIを叩いても1回分しか実行されない)。
 * 返金API呼び出し自体が失敗した場合は CRITICAL ログ('REFUND FAILED - 手動返金要')を残し、
 * refunded:false を返す(呼び出し元はこれをキャンセル自体の失敗にはしない=fail open)。
 * 返金成功後、payment_status を 'paid' → 'refunded' に更新する(CHECK制約なしのカラム・DDL不要)。
 * レビュー指摘(中1): メールに載せる返金額はコード再計算ではなくStripeの戻り値(refund.amount)を
 * 正とする。charge_already_refunded(冪等ヒット)時のみ、Stripe側の金額が取得できないため
 * fallbackAmountJpy(呼び出し元が計算した予約金額)にフォールバックする。
 */
export async function refundReferralBookingFee(params: {
  bookingId: string
  stripePaymentIntentId: string | null
  fallbackAmountJpy: number
}): Promise<{ refunded: boolean; amountJpy: number | null; reason?: 'no_payment_intent' | 'stripe_error' }> {
  if (!params.stripePaymentIntentId) {
    console.error(
      `[referral-payment] REFUND FAILED - 手動返金要 (booking ${params.bookingId}): stripe_payment_intent_id が無い`
    )
    return { refunded: false, amountJpy: null, reason: 'no_payment_intent' }
  }

  let refundedAmountJpy: number | null = null
  try {
    const stripe = getReferralStripe()
    const refund = await stripe.refunds.create(
      { payment_intent: params.stripePaymentIntentId },
      { idempotencyKey: `refund-${params.bookingId}` }
    )
    // JPYは最小単位=円のため換算不要(Checkout作成時のunit_amountと同じ規約)。
    refundedAmountJpy = typeof refund.amount === 'number' ? refund.amount : params.fallbackAmountJpy
  } catch (err: any) {
    // 冪等性: 既に返金済みなら成功扱いで続行する(この場合Stripeの金額は取得できないためフォールバック)
    const code = err?.code || err?.raw?.code
    if (code !== 'charge_already_refunded') {
      console.error(
        `[referral-payment] REFUND FAILED - 手動返金要 (booking ${params.bookingId}):`,
        err?.message || err
      )
      return { refunded: false, amountJpy: null, reason: 'stripe_error' }
    }
    refundedAmountJpy = params.fallbackAmountJpy
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('referral_bookings')
    .update({ payment_status: 'refunded' })
    .eq('id', params.bookingId)
    .eq('payment_status', 'paid')

  if (error) {
    console.error(
      `[referral-payment] refundReferralBookingFee: payment_status update failed (booking ${params.bookingId}):`,
      error.message
    )
  }

  return { refunded: true, amountJpy: refundedAmountJpy }
}

/**
 * バグ報告(2026-08-04・CEO): 決済を中断すると再開導線が無い問題への対応。
 * /booking/[booking_id] の「お支払いに進む」ボタンから叩かれる決済リンク再取得の中核処理。
 * Stripeロジックはこの関数に集約し、呼び出し元のAPI routeにはStripeのimportを持たせない
 * (Webpackチャンクグラフ対策・既存の中1レビュー指摘を踏襲)。
 *
 * - status='confirmed' かつ payment_status='awaiting' 以外は 'not_awaiting' を返す
 *   (呼び出し元がpaymentStatusを見てpaid/その他を判定・409にマッピングする)。
 * - confirmed_atから24h(CONFIRM_PAYMENT_DEADLINE_HOURS)を超えている場合は、cronの自動
 *   キャンセルがまだ走っていなくても新規発行しない(レビュー指摘・中5: cron交差の1時間窓の穴閉塞)。
 * - 既存の stripe_checkout_session_id があれば取得する。status==='complete' または
 *   payment_status==='paid' の場合は、webhook反映が未着(遅延)の可能性があるため
 *   session_idを一切書き換えず 'not_awaiting'(paid扱い)を返す(レビュー指摘・重大1: 二重決済防止)。
 *   retrieve自体が失敗(Stripe一時エラー)した場合は実状態が分からないため新規発行に進まず
 *   'error'を返す(客はメールの既存リンクで支払えるフェイルセーフ・レビュー指摘・重大2)。
 * - status==='open' かつ url有りならそのURLをそのまま返す(既存セッション再利用)。
 * - status==='expired'は既に誰も支払えない状態(Stripe上の3値はopen/complete/expiredのみ)なので
 *   失効の再実行は不要。open なのにurlが欠落する異常系のみ明示的にexpireし、
 *   失効成功を確認できた場合のみ新規セッション作成に進む(レビュー指摘・重大2)。
 * - 新規セッション作成後は既存session_idをCASキーにしたUPDATEで保存する(レビュー指摘・中3)。
 *   0行(競合)なら作成したセッションを失効させ、再SELECTした現在のセッションが開いていれば
 *   そのURLを返し、そうでなければ 'not_awaiting' を返す。
 */
export async function getOrCreateFeePaymentLink(
  bookingId: string
): Promise<
  | { outcome: 'ok'; checkoutUrl: string }
  | { outcome: 'not_awaiting'; paymentStatus: string | null }
  | { outcome: 'not_found' }
  | { outcome: 'error' }
> {
  const supabase = getSupabaseAdmin()

  const { data } = await supabase
    .from('referral_bookings')
    .select(
      'id, status, payment_status, price_jpy, fee_total_bps, stripe_checkout_session_id, client_email, confirmed_at, referral_lists(slug), pro_menus(name)'
    )
    .eq('id', bookingId)
    .maybeSingle()

  if (!data) return { outcome: 'not_found' }
  const booking = data as any

  if (booking.status !== 'confirmed' || booking.payment_status !== 'awaiting') {
    return { outcome: 'not_awaiting', paymentStatus: booking.payment_status || null }
  }

  // レビュー指摘(中5): cronの自動キャンセル(24h)が未実行の間(cron交差の1時間窓)でも、
  // 期限を過ぎた予約に新しい決済リンクを発行しない。
  if (booking.confirmed_at) {
    const deadline = new Date(booking.confirmed_at).getTime() + CONFIRM_PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000
    if (deadline < Date.now()) {
      return { outcome: 'not_awaiting', paymentStatus: booking.payment_status }
    }
  }

  const stripe = getReferralStripe()
  const existingSessionId: string | null = booking.stripe_checkout_session_id || null

  if (existingSessionId) {
    let existing: Stripe.Checkout.Session
    try {
      existing = await stripe.checkout.sessions.retrieve(existingSessionId)
    } catch (err) {
      // レビュー指摘(重大2): retrieve自体が失敗した場合は実状態不明のため新規発行に進まない
      console.error('[referral-payment] getOrCreateFeePaymentLink retrieve error:', err)
      return { outcome: 'error' }
    }

    if (existing.status === 'complete' || existing.payment_status === 'paid') {
      // レビュー指摘(重大1): webhook反映が未着の可能性があるためsession_idを書き換えない
      return { outcome: 'not_awaiting', paymentStatus: 'paid' }
    }
    if (existing.status === 'open' && existing.url) {
      return { outcome: 'ok', checkoutUrl: existing.url }
    }
    if (existing.status === 'open') {
      // open なのにurlが欠落する異常系のみ失効させ、成功を確認できた場合のみ新規発行に進む
      const expired = await expireReferralCheckoutSession(existingSessionId)
      if (!expired) return { outcome: 'error' }
    }
    // status==='expired'はここに到達する。既に誰も支払えないため失効の再実行は不要。
  }

  const feeTotalBps = booking.fee_total_bps ?? REFERRAL_FEE_TOTAL_BPS
  const feeAmountJpy = booking.price_jpy > 0 ? Math.floor((booking.price_jpy * feeTotalBps) / 10000) : 0
  if (feeAmountJpy < REFERRAL_MIN_FEE_JPY) {
    // レビュー指摘(軽微8): 他3経路(bookings/received/cron)と同じ最低決済額ガード
    console.error(`[referral-payment] getOrCreateFeePaymentLink feeAmountJpy below minimum for booking ${bookingId}`)
    return { outcome: 'not_awaiting', paymentStatus: booking.payment_status }
  }

  const slug = booking.referral_lists?.slug || ''
  const listUrl = slug ? `${APP_URL}/r/${slug}` : APP_URL
  const menuName = booking.pro_menus?.name || null

  const created = await createReferralCheckoutSession({
    bookingId,
    amountJpy: feeAmountJpy,
    itemName: `予約金（${menuName || 'ご相談'}）`,
    clientEmail: booking.client_email || undefined,
    successUrl: `${listUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${APP_URL}/booking/${bookingId}?payment=canceled`,
  })

  if (!created) return { outcome: 'error' }

  // レビュー指摘(中3): 保存先のCAS(compare-and-swap)キーをsession_idにし、その間に他経路が
  // 別のセッションIDへ書き換えていた場合は自分の更新を通さない(旧session_id or null限定)。
  let updateQuery = supabase
    .from('referral_bookings')
    .update({ stripe_checkout_session_id: created.sessionId })
    .eq('id', bookingId)
    .eq('payment_status', 'awaiting')
  updateQuery = existingSessionId
    ? updateQuery.eq('stripe_checkout_session_id', existingSessionId)
    : updateQuery.is('stripe_checkout_session_id', null)
  const { data: updatedRows, error } = await updateQuery.select('id')

  if (error) {
    console.error('[referral-payment] getOrCreateFeePaymentLink update error:', error.message)
    await expireReferralCheckoutSession(created.sessionId)
    return { outcome: 'error' }
  }
  if (!updatedRows || updatedRows.length === 0) {
    // 競合(その間に他経路がsession_id/payment_statusを進めた): 誰も支払えないリンクを残さない
    await expireReferralCheckoutSession(created.sessionId)
    const { data: latest } = await supabase
      .from('referral_bookings')
      .select('payment_status, stripe_checkout_session_id')
      .eq('id', bookingId)
      .maybeSingle()
    if (latest?.payment_status === 'awaiting' && latest.stripe_checkout_session_id) {
      try {
        const current = await stripe.checkout.sessions.retrieve(latest.stripe_checkout_session_id)
        if (current.status === 'open' && current.url) {
          return { outcome: 'ok', checkoutUrl: current.url }
        }
      } catch (err) {
        console.error('[referral-payment] getOrCreateFeePaymentLink re-check error:', err)
      }
    }
    return { outcome: 'not_awaiting', paymentStatus: latest?.payment_status || null }
  }

  return { outcome: 'ok', checkoutUrl: created.url }
}

/**
 * 予約フィーの決済リンクを発行し、payment_status='unpaid'→'awaiting'へ昇格、
 * クライアントへ決済リンク付きメールを送る共通処理(レビュー指摘・中1で共通化)。
 *
 * 呼び出し元: bookings/received PATCH confirm(確定と同時)、
 * cron/expire-referral-bookings(confirmed×unpaidの取り残し再試行)。
 *
 * 冪等性(レビュー指摘・重大1): payment_status='unpaid'をUPDATE条件に必ず入れる。
 * UPDATEが0行(二重confirm等の競合で既に他経路がawaiting/paid等へ進めていた)の場合、
 * 誰も支払えない決済リンクを残さないよう、作成済みのCheckout Sessionを即座に失効させる。
 *
 * 戻り値: success=true=決済リンクを発行しメール送信を試みた(呼び出し元は「成立」扱いの通知を送らない)。
 *        checkoutUrl=発行したCheckout SessionのURL(呼び出し元がクライアントを直接遷移させたい場合に使う。
 *        例: クライアントの日時選択ページ(/booking/[booking_id])からのaccept)。
 *        success=false=決済リンクを発行できなかった(呼び出し元はfail openで従来の無決済フローへ)。
 */
export async function issueFeePaymentLinkAndNotify(params: {
  bookingId: string
  priceJpy: number
  feeAmountJpy: number
  menuName: string | null
  clientEmail: string | null
  clientUserId: string | null
  receiverProName: string
  confirmedSlotText: string | null
  successUrl: string
  cancelUrl: string
  /** ライフサイクル改善(タスクC): メール末尾に紹介リストリンクを添える。未指定時はAPP_URL。 */
  listUrl?: string
}): Promise<{ success: boolean; checkoutUrl: string | null }> {
  const supabase = getSupabaseAdmin()

  const checkout = await createReferralCheckoutSession({
    bookingId: params.bookingId,
    amountJpy: params.feeAmountJpy,
    itemName: `予約金（${params.menuName || 'ご相談'}）`,
    clientEmail: params.clientEmail || undefined,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
  })

  if (!checkout) {
    console.error(`[referral-payment] createReferralCheckoutSession failed for booking ${params.bookingId}`)
    return { success: false, checkoutUrl: null }
  }

  const { data: updatedRows, error: paymentUpdateError } = await supabase
    .from('referral_bookings')
    .update({ payment_status: 'awaiting', stripe_checkout_session_id: checkout.sessionId })
    .eq('id', params.bookingId)
    .eq('payment_status', 'unpaid')
    .select('id')

  if (paymentUpdateError || !updatedRows || updatedRows.length === 0) {
    if (paymentUpdateError) {
      console.error(
        '[referral-payment] payment_status awaiting update failed:',
        paymentUpdateError.message
      )
    } else {
      console.error(
        `[referral-payment] payment_status awaiting update matched 0 rows for booking ${params.bookingId} (競合の可能性)`
      )
    }
    // レビュー指摘(重大1): 払える死んだリンクを残さない。失敗はログのみ。
    await expireReferralCheckoutSession(checkout.sessionId)
    return { success: false, checkoutUrl: null }
  }

  const residualJpy = params.priceJpy - params.feeAmountJpy
  const safeReceiverProName = escapeHtml(params.receiverProName)
  const listUrl = params.listUrl || APP_URL
  try {
    if (params.clientUserId || params.clientEmail) {
      await notifyClientByEmail(
        { userId: params.clientUserId, email: params.clientEmail },
        `${params.receiverProName}さんとの紹介予約確定・お支払いのご案内`,
        emailShell(
          '紹介予約確定・お支払いのご案内',
          `${params.confirmedSlotText ? `${params.confirmedSlotText} に確定しました。` : 'ご相談の日時が確定しました。'}<br>担当: ${safeReceiverProName}さん<br><br>` +
            `予約金 ¥${params.feeAmountJpy.toLocaleString()} のお支払いで紹介予約が成立します(24時間以内)。<br>` +
            `当日は残額 ¥${residualJpy.toLocaleString()} を${safeReceiverProName}さんに直接お支払いください(合計 ¥${params.priceJpy.toLocaleString()} は変わりません)。<br>` +
            // 予約フィー説明不足対応(CEO指示・2026-08-04): 3点セットの③(返金条件)を明記する。
            `${safeReceiverProName}さんの都合でキャンセルとなった場合、予約金は全額返金されます。` +
            // CEO決定(2026-08-04・追加): キャンセルポリシーの4点目(クライアント都合の72時間前ルール)。
            `クライアント様のご都合によるキャンセルは、セッション開始の72時間前まで全額返金・それ以降は返金いたしかねます。` +
            // バグ報告(2026-08-04)対応: 決済リンク切れ・中断時の自己救済導線(予約ページから再開できる)
            `<br><br>お支払い状況の確認・再開はこちら: <a href="${APP_URL}/booking/${params.bookingId}" style="color:#888888;text-decoration:underline;">${APP_URL}/booking/${params.bookingId}</a>` +
            referralListFooterHtml(listUrl),
          'お支払いを行う',
          checkout.url
        )
      )
    }
  } catch (notifyErr) {
    console.error('[referral-payment] payment-link notify error:', notifyErr)
  }

  return { success: true, checkoutUrl: checkout.url }
}

/** professionals にまだ040(stripe_connect_account_id等)が反映されていない環境を示すエラーコード。 */
function isConnectSchemaMissing(err: { code?: string } | null | undefined): boolean {
  if (!err) return false
  const code = err.code || ''
  return code === '42703' || code === 'PGRST204' || code === 'PGRST205' || code === '42P01'
}

/**
 * ステージ4「Stripe Connect 口座登録導線」(CEO承認済み・2026-08-04): 送り手プロ向けの
 * Express onboarding リンクを発行する。Stripeパッケージのimportは既存規約に合わせこの
 * ファイル(referral-payment.ts)に閉じ、呼び出し元の新規route(/api/referral/connect/onboard)
 * にはStripeのimportを持たせない(そのroute自体は新規ファイルのためWebpackチャンクグラフの
 * 既存破壊リスクは無いが、Stripe呼び出しを1箇所に集約する既存規約はそのまま維持する)。
 *
 * レビュー指摘(重大2): REFERRAL_STRIPE_SECRET_KEY未設定環境でStripeの生エラーを漏らさない
 * ため、先頭で isReferralPaymentEnabled() を確認し、未設定なら not_ready を返す
 * (getReferralStripe()の呼び出しは必ずtry内で行う)。
 *
 * 二重作成防止: professionals.stripe_connect_account_id が null の場合のみ
 * `.is('stripe_connect_account_id', null)` をガードにしたUPDATEでアカウントIDを保存する。
 * 0行(競合・同時に他リクエストが先にIDを保存した)場合、再SELECTで既存アカウントIDが
 * 取得できればそれを使うが、取得できない(想定外)場合は作成した孤児アカウントへ
 * フォールバックせず error を返す(レビュー指摘・中3: 未保存アカウントでKYCが完了すると
 * professionals側は永久にnoneのまま=クリックごとに新規孤児アカウントが増殖するため)。
 * 孤児が発生した場合は created.id と proId を console.warn に残す(手動追跡用)。
 */
export async function createConnectOnboardingLink(
  proId: string
): Promise<{ outcome: 'ok'; url: string } | { outcome: 'not_ready' } | { outcome: 'error' }> {
  if (!isReferralPaymentEnabled()) return { outcome: 'not_ready' }

  const supabase = getSupabaseAdmin()

  const { data: pro, error: selectError } = await supabase
    .from('professionals')
    .select('id, stripe_connect_account_id')
    .eq('id', proId)
    .maybeSingle()

  if (selectError) {
    if (isConnectSchemaMissing(selectError)) return { outcome: 'not_ready' }
    console.error('[referral-payment] createConnectOnboardingLink select error:', selectError)
    return { outcome: 'error' }
  }
  if (!pro) return { outcome: 'error' }
  // レビュー指摘(中4): PostgRESTのスキーマキャッシュが未反映(040未実行/未反映直後)だと、
  // エラーにならずキー自体が存在しない行が返ることがある。列の実在を明示的に確認する。
  if (!('stripe_connect_account_id' in pro)) return { outcome: 'not_ready' }

  let accountId: string | null = (pro as any).stripe_connect_account_id || null

  if (!accountId) {
    let created: Stripe.Account
    try {
      const stripe = getReferralStripe()
      created = await stripe.accounts.create(
        {
          type: 'express',
          country: 'JP',
          capabilities: { transfers: { requested: true } },
          // レビュー指摘(中5): business_typeは固定せずStripe onboarding側に選ばせる
          // (法人プロのKYC不整合防止)
          metadata: { pro_id: proId },
        },
        { idempotencyKey: `rp-connect-acct-${proId}` } // レビュー指摘(中6)
      )
    } catch (err) {
      console.error('[referral-payment] createConnectOnboardingLink accounts.create error:', err)
      return { outcome: 'error' }
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from('professionals')
      .update({ stripe_connect_account_id: created.id })
      .eq('id', proId)
      .is('stripe_connect_account_id', null)
      .select('id')

    if (updateError) {
      if (isConnectSchemaMissing(updateError)) return { outcome: 'not_ready' }
      console.error('[referral-payment] createConnectOnboardingLink update error:', updateError)
      return { outcome: 'error' }
    }

    if (updatedRows && updatedRows.length > 0) {
      accountId = created.id
    } else {
      // 競合(二重作成防止): 他リクエストが先に保存済み。再SELECTして既存アカウントを使う。
      const { data: latest } = await supabase
        .from('professionals')
        .select('stripe_connect_account_id')
        .eq('id', proId)
        .maybeSingle()
      if (latest?.stripe_connect_account_id) {
        accountId = latest.stripe_connect_account_id
      } else {
        // レビュー指摘(中3): 未保存アカウントへフォールバックしない(孤児増殖の防止)。
        console.warn(
          `[referral-payment] createConnectOnboardingLink orphaned Stripe account (unsaved): created.id=${created.id} proId=${proId}`
        )
        return { outcome: 'error' }
      }
    }
  }

  if (!accountId) return { outcome: 'error' }

  try {
    const stripe = getReferralStripe()
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      refresh_url: `${APP_URL}/dashboard?tab=referral&sub=cases&connect=refresh`,
      return_url: `${APP_URL}/dashboard?tab=referral&sub=cases&connect=return`,
    })
    return { outcome: 'ok', url: accountLink.url }
  } catch (err) {
    console.error('[referral-payment] createConnectOnboardingLink accountLinks.create error:', err)
    return { outcome: 'error' }
  }
}

/**
 * ステージ4「Stripe Connect 口座登録導線」: 送り手プロの受け取り口座登録状況を返す。
 * - アカウント未作成: 'none'
 * - 作成済みだが本人確認未完了(`details_submitted`がfalse): 'pending'(登録を再開できる)
 * - 本人確認は提出済みだが`payouts_enabled`がまだfalse(Stripe審査中): 'reviewing'
 *   (レビュー指摘・軽微7。再開ボタンは出さない=送り手が押しても何も変わらないため)
 * - `payouts_enabled`がtrue: 'enabled'
 * Stripe retrieve失敗時はキャッシュ(stripe_connect_payouts_enabled)にフォールバックする
 * (fail open・表示が一時的に古くなるだけで機能は止めない。reviewingはキャッシュに保存して
 * いないため、フォールバック時はpending/enabledの2値に縮退する)。
 */
export async function getConnectStatus(
  proId: string
): Promise<
  | { outcome: 'ok'; status: 'none' | 'pending' | 'reviewing' | 'enabled' }
  | { outcome: 'not_ready' }
  | { outcome: 'error' }
> {
  if (!isReferralPaymentEnabled()) return { outcome: 'not_ready' }

  const supabase = getSupabaseAdmin()

  const { data: pro, error } = await supabase
    .from('professionals')
    .select('stripe_connect_account_id, stripe_connect_payouts_enabled')
    .eq('id', proId)
    .maybeSingle()

  if (error) {
    if (isConnectSchemaMissing(error)) return { outcome: 'not_ready' }
    console.error('[referral-payment] getConnectStatus select error:', error)
    return { outcome: 'error' }
  }
  if (!pro) return { outcome: 'error' }
  // レビュー指摘(中4): スキーマキャッシュ未反映の防御(createConnectOnboardingLinkと同様)
  if (!('stripe_connect_account_id' in pro)) return { outcome: 'not_ready' }

  const accountId: string | null = (pro as any).stripe_connect_account_id || null
  if (!accountId) return { outcome: 'ok', status: 'none' }

  const cachedEnabled = !!(pro as any).stripe_connect_payouts_enabled

  try {
    const stripe = getReferralStripe()
    const account = await stripe.accounts.retrieve(accountId)
    const payoutsEnabled = !!account.payouts_enabled
    const detailsSubmitted = !!account.details_submitted

    if (payoutsEnabled !== cachedEnabled) {
      const { error: updateError } = await supabase
        .from('professionals')
        .update({ stripe_connect_payouts_enabled: payoutsEnabled })
        .eq('id', proId)
      if (updateError && !isConnectSchemaMissing(updateError)) {
        console.error('[referral-payment] getConnectStatus cache update error:', updateError)
      }
    }

    if (payoutsEnabled) return { outcome: 'ok', status: 'enabled' }
    if (detailsSubmitted) return { outcome: 'ok', status: 'reviewing' }
    return { outcome: 'ok', status: 'pending' }
  } catch (err) {
    console.error('[referral-payment] getConnectStatus retrieve error (fallback to cache):', err)
    return { outcome: 'ok', status: cachedEnabled ? 'enabled' : 'pending' }
  }
}

/** 競合(webhookとフォールバックの同時実行等)で更新0行だった場合、DBの実状態を再取得して返す。 */
async function currentPaymentOutcome(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  bookingId: string
): Promise<'paid' | 'pending'> {
  const { data: latest } = await supabase
    .from('referral_bookings')
    .select('payment_status')
    .eq('id', bookingId)
    .maybeSingle()
  return latest?.payment_status === 'paid' ? 'paid' : 'pending'
}

/**
 * Stripe Checkout Session の状態を referral_bookings に反映する(予約フィー方式)。
 * 支払い完了(session.payment_status==='paid')のみ処理する。それ以外(未完了・失効)は
 * 何もせず'pending'を返す(24時間の支払い期限判定はcron側で行う。ここでは書き換えない)。
 */
export async function applyReferralCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<'paid' | 'pending' | 'not_found'> {
  const bookingId = session.metadata?.booking_id
  if (!bookingId) return 'not_found'

  const supabase = getSupabaseAdmin()
  const { data: booking } = await supabase
    .from('referral_bookings')
    .select(
      'id, payment_status, status, sender_pro_id, receiver_pro_id, client_id, client_email, preferred_slots, referral_lists(slug)'
    )
    .eq('id', bookingId)
    .maybeSingle()

  if (!booking) return 'not_found'

  // 冪等: awaiting以外(既にpaid、または他経路で状態が変わった)なら再処理・再通知しない
  if (booking.payment_status !== 'awaiting') {
    // レビュー指摘(重大1・保険): Stripe側は支払い完了しているのにDBがawaitingでない場合、
    // 返金確認が必要な異常系として必ずログに残す(気づけない状態を許容しない)。
    if (session.payment_status === 'paid') {
      console.error('[referral-payment] PAID BUT NOT AWAITING - 要返金確認', bookingId, session.id)
    }
    return booking.payment_status === 'paid' ? 'paid' : 'pending'
  }

  if (session.payment_status !== 'paid') {
    // 未完了・キャンセル・失効(session.status==='expired'を含む)はここでは何もしない。
    // payment_statusは'awaiting'のまま保持し、24時間の期限判定はcron(expire-referral-bookings)に委ねる。
    return 'pending'
  }

  // レビュー指摘(軽微4): 返金照合用にPaymentIntent IDを保存する
  const paymentIntentId = extractPaymentIntentId(session.payment_intent)

  const { data: updatedRows, error } = await supabase
    .from('referral_bookings')
    .update({ payment_status: 'paid', stripe_payment_intent_id: paymentIntentId })
    .eq('id', bookingId)
    .eq('payment_status', 'awaiting')
    .select('id')

  if (error) {
    console.error('[referral-payment] update to paid failed:', error.message)
    return 'pending'
  }
  if (!updatedRows || updatedRows.length === 0) {
    // 競合で既に他経路(webhookとフォールバックの同時実行等)が処理済み。再SELECTして実状態を返す(再通知しない)
    return currentPaymentOutcome(supabase, bookingId)
  }

  // 支払い完了 = 予約成立。受け手・送り手・クライアントの3者へ通知する
  // (失敗しても決済処理自体は成功扱い。PIIは通知文面に含めない)
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('user_id, nickname')
      .eq('id', booking.client_id)
      .maybeSingle()
    const clientNickname = client?.nickname || 'クライアント'

    // CEO決定(2026-08-04): 成立時のクライアント宛メールに場所・連絡先を自動掲載するため、
    // アクセス情報カラムも合わせて取得する。
    const { data: receiverPro } = await supabase
      .from('professionals')
      .select(
        'name, contact_email, line_messaging_user_id, address, nearest_station, walk_minutes, access_note, google_maps_url, booking_url, website_url, phone_number'
      )
      .eq('id', booking.receiver_pro_id)
      .maybeSingle()

    if (receiverPro) {
      await notifyBookingPaymentCompletedToReceiver(
        {
          name: receiverPro.name,
          contact_email: receiverPro.contact_email,
          line_messaging_user_id: receiverPro.line_messaging_user_id,
        },
        clientNickname,
        { remindMissingLocationInfo: !hasProLocationInfo(receiverPro) }
      )
    }

    if (booking.sender_pro_id && receiverPro) {
      const { data: senderPro } = await supabase
        .from('professionals')
        .select('name, contact_email, line_messaging_user_id')
        .eq('id', booking.sender_pro_id)
        .maybeSingle()
      if (senderPro) {
        await notifyBookingConfirmedToSender(
          {
            name: senderPro.name,
            contact_email: senderPro.contact_email,
            line_messaging_user_id: senderPro.line_messaging_user_id,
          },
          clientNickname,
          receiverPro.name
        )
      }
    }

    if (client?.user_id || booking.client_email) {
      const slug = (booking as any).referral_lists?.slug || ''
      const listUrl = slug ? `${APP_URL}/r/${slug}` : APP_URL
      // レビュー軽微3: receiverPro取得失敗時も「先生からご連絡があります」のフォールバック文を出す
      // (他経路の全nullオブジェクト渡しと挙動を統一)
      const accessHtml = buildBookingLocationContactHtml(
        receiverPro || {
          address: null, nearest_station: null, walk_minutes: null, access_note: null,
          google_maps_url: null, booking_url: null, website_url: null, phone_number: null, contact_email: null,
        }
      )
      // ライフサイクル改善(タスクC・2026-08-04・CEO指示): 成立メールにGoogleカレンダー追加リンクと
      // 「変更は連絡先へ直接」の一文を添える。
      const confirmedSlotIso = resolveConfirmedSlotIso((booking as any).preferred_slots)
      const calendarUrl = confirmedSlotIso
        ? buildGoogleCalendarUrl({
            startIso: confirmedSlotIso,
            title: `${receiverPro?.name || 'プロ'}さんとの紹介予約(REAL PROOF)`,
            location: receiverPro?.address || undefined,
          })
        : null
      await notifyClientByEmail(
        { userId: client?.user_id, email: booking.client_email },
        'お支払いが完了し、紹介予約が成立しました',
        emailShell(
          '紹介予約成立のお知らせ',
          `お支払いが完了し、紹介予約が成立しました。当日はよろしくお願いいたします。${accessHtml}${buildCalendarLinkHtml(calendarUrl)}${buildRescheduleContactNoteHtml(
            receiverPro || { booking_url: null, website_url: null, phone_number: null, contact_email: null }
          )}${referralListFooterHtml(listUrl)}`
        )
      )
    }
  } catch (notifyErr) {
    console.error('[referral-payment] notify error:', notifyErr)
  }

  return 'paid'
}

/**
 * ステージ4「送り手分配の自動送金」(CEO承認済み・2026-08-05): referral_payouts の1行(status='pending')を
 * プラットフォーム残高から送り手のStripe Connectアカウントへ transfers.create で送金する。
 *
 * 呼び出し元: bookings/received PATCH complete(受け手の手動完了)、cron/expire-referral-bookings
 * (自動完了直後・および status='pending' の取り残しを再試行するブロック)。いずれも
 * createReferralPayoutIfEligible が返す payoutId を使って呼ぶ(fail-soft・失敗しても完了処理自体は成功扱い)。
 *
 * 二重送金防止(最優先・多層防御・レビュー指摘・重大1で追加):
 * ① 既送金チェック(耐久的・最優先): transfers.create の前に
 *    `stripe.transfers.list({ transfer_group: 'booking-'+booking_id })` で、このpayoutId用の
 *    transferが既に存在しないか確認する(metadata.payout_idで一致判定)。idempotencyKeyは24hで
 *    Stripe側から失効するため、「DB更新失敗・関数タイムアウト・レスポンス切断でtransferは成立済みなのに
 *    referral_payouts.statusがpendingのまま24h超残留 → cron再試行」のパスではidempotencyKeyが
 *    効かず二重transferになりうる。この既送金チェックが実質的な防御の本体。
 * ② Stripe側(保険): 新規作成時のみ transfers.create に idempotencyKey(`rp-payout-${payoutId}`)を付与
 *    (24h以内のネットワーク再試行等で多重送金にならない・①の穴を24h以内は二重に塞ぐ)。
 * ③ DB側: 送金成功後のstatus更新は CAS(`.eq('status','pending')`)で行う。0行(競合・別呼び出しが
 *    既にpaidへ進めていた)の場合、Stripe側は既に送金済みのため取り消せない。CRITICALログを残し
 *    (payout_id・transfer id)、手動確認に回す(送金自体はoutcome:'transferred'として返す)。
 *
 * レビュー指摘(重大3): transfer実行の直前に referral_bookings を再SELECTし、
 * status='completed' && payment_status='paid' でなければ送金しない(CEOが手動返金してから
 * referral_payouts.status を'cancelled'に更新するまでの窓・打ち忘れで、返金済み予約に送金してしまう
 * 穴を閉塞する)。paid化済みのpayoutを後から取り消す場合はStripeのtransfer reversalが必要
 * (migration 039のコメントに運用メモを追記済み)。
 *
 * レビュー指摘(中4): amount_jpyが0以下ならskip。REFERRAL_MAX_AUTO_TRANSFER_JPY(feature-flags.ts)を
 * 超える金額は自動送金せず、CRITICALログ('TRANSFER AMOUNT EXCEEDS CAP - 手動送金要')を残して
 * pendingのまま人手対応に回す(価格入力ミス等による想定外の高額送金を防ぐ)。
 *
 * レビュー指摘(中5): アカウントIDはあるがキャッシュ(stripe_connect_payouts_enabled)がfalseの場合、
 * 送金試行前に既存の getConnectStatus() を1回呼んでStripe側の最新状態にリフレッシュする
 * (キャッシュ更新のタイミングが遅れて「本当は有効なのに永久にno_account」になる穴を閉塞)。
 *
 * fail-soft対象はスキーマ未反映(migration 039/040未実行)のみ。isReferralPaymentEnabled()が
 * falseの間はStripeキー未設定環境の防御として先頭でnot_readyを返す(既存のConnect関数と同じ規約)。
 * 口座未登録/審査未完了(payouts_enabled!==true)は no_account を返し、pendingのまま残す
 * (cronの再試行ブロックが毎回拾い直す。エラーではない)。
 */
export async function executeReferralPayoutTransfer(
  payoutId: string
): Promise<
  | { outcome: 'transferred' }
  | { outcome: 'skipped' }
  | { outcome: 'no_account' }
  | { outcome: 'capped' }
  | { outcome: 'not_ready' }
  | { outcome: 'error' }
> {
  if (!isReferralPaymentEnabled()) return { outcome: 'not_ready' }

  const supabase = getSupabaseAdmin()

  const { data: payout, error: payoutError } = await supabase
    .from('referral_payouts')
    .select('id, booking_id, sender_pro_id, amount_jpy, status, note')
    .eq('id', payoutId)
    .maybeSingle()

  if (payoutError) {
    if (isConnectSchemaMissing(payoutError)) return { outcome: 'not_ready' }
    console.error(`[referral-payment] executeReferralPayoutTransfer payout fetch error (payout ${payoutId}):`, payoutError)
    return { outcome: 'error' }
  }
  if (!payout || payout.status !== 'pending') return { outcome: 'skipped' }

  // レビュー指摘(重大3): 送金直前にbookingの実状態を再確認する(手動返金の打ち忘れ穴の閉塞)。
  const { data: bookingCheck, error: bookingCheckError } = await supabase
    .from('referral_bookings')
    .select('status, payment_status')
    .eq('id', payout.booking_id)
    .maybeSingle()

  if (bookingCheckError) {
    if (isConnectSchemaMissing(bookingCheckError)) return { outcome: 'not_ready' }
    console.error(
      `[referral-payment] executeReferralPayoutTransfer booking check error (payout ${payoutId}):`,
      bookingCheckError
    )
    return { outcome: 'error' }
  }
  if (!bookingCheck || bookingCheck.status !== 'completed' || bookingCheck.payment_status !== 'paid') {
    return { outcome: 'skipped' }
  }

  // レビュー指摘(重大1): idempotencyKeyは24hで失効するため、これが実質的な多重送金防止の本体。
  // このpayout用のtransferが既に存在すれば新規createせず、既存transferでCASだけやり直す。
  const transferGroup = `booking-${payout.booking_id}`
  let existingTransfer: Stripe.Transfer | null = null
  try {
    const stripe = getReferralStripe()
    const list = await stripe.transfers.list({ transfer_group: transferGroup, limit: 100 })
    existingTransfer = list.data.find((t) => t.metadata?.payout_id === payoutId) || null
  } catch (err) {
    console.error(
      `[referral-payment] executeReferralPayoutTransfer existing-transfer check error (payout ${payoutId}):`,
      err instanceof Error ? err.message : err
    )
    return { outcome: 'error' }
  }

  let transfer: Stripe.Transfer
  if (existingTransfer) {
    transfer = existingTransfer
  } else {
    // レビュー指摘(中4): 新規送金を開始する場合のみ金額ガードを適用する
    // (既送金の場合は金額に関わらずDB側の記録合わせのみ行う)。
    if (!(payout.amount_jpy > 0)) return { outcome: 'skipped' }
    if (payout.amount_jpy > REFERRAL_MAX_AUTO_TRANSFER_JPY) {
      console.error(
        `[referral-payment] TRANSFER AMOUNT EXCEEDS CAP - 手動送金要 (payout ${payoutId}, amount ${payout.amount_jpy})`
      )
      return { outcome: 'capped' }
    }

    const { data: pro, error: proError } = await supabase
      .from('professionals')
      .select('id, stripe_connect_account_id, stripe_connect_payouts_enabled')
      .eq('id', payout.sender_pro_id)
      .maybeSingle()

    if (proError) {
      if (isConnectSchemaMissing(proError)) return { outcome: 'not_ready' }
      console.error(`[referral-payment] executeReferralPayoutTransfer pro fetch error (payout ${payoutId}):`, proError)
      return { outcome: 'error' }
    }
    const accountId: string | null = (pro as any)?.stripe_connect_account_id || null
    if (!accountId) return { outcome: 'no_account' }

    let payoutsEnabled: boolean = (pro as any)?.stripe_connect_payouts_enabled === true
    if (!payoutsEnabled) {
      // レビュー指摘(中5): キャッシュがfalseの場合のみ、既存のgetConnectStatus()でStripe側の
      // 最新状態に1回リフレッシュする(キャッシュ反映の遅れによる永久no_accountを防ぐ)。
      const refreshed = await getConnectStatus(payout.sender_pro_id)
      payoutsEnabled = refreshed.outcome === 'ok' && refreshed.status === 'enabled'
    }
    if (!payoutsEnabled) return { outcome: 'no_account' }

    try {
      const stripe = getReferralStripe()
      transfer = await stripe.transfers.create(
        {
          amount: payout.amount_jpy,
          currency: 'jpy',
          destination: accountId,
          transfer_group: transferGroup,
          metadata: { payout_id: payout.id, booking_id: payout.booking_id },
        },
        { idempotencyKey: `rp-payout-${payoutId}` }
      )
    } catch (err) {
      // PIIなし(payout_idのみ)。Stripeの生エラーはメッセージのみ残す。
      console.error(
        `[referral-payment] TRANSFER FAILED (payout ${payoutId}):`,
        err instanceof Error ? err.message : err
      )
      return { outcome: 'error' }
    }
  }

  // レビュー指摘(軽微10): noteは上書きでなく追記(既存note・手動運用メモが残るように)。
  const paidAtIso = new Date().toISOString()
  const nextNote = payout.note ? `${payout.note} / ${transfer.id}` : transfer.id
  const { data: updatedRows, error: updateError } = await supabase
    .from('referral_payouts')
    .update({ status: 'paid', paid_at: paidAtIso, note: nextNote })
    .eq('id', payoutId)
    .eq('status', 'pending')
    .select('id')

  if (updateError) {
    console.error(
      `[referral-payment] TRANSFER DONE BUT STATUS RACE (payout ${payoutId}, transfer ${transfer.id}) - update error:`,
      updateError.message
    )
    return { outcome: 'transferred' }
  }
  if (!updatedRows || updatedRows.length === 0) {
    console.error(`[referral-payment] TRANSFER DONE BUT STATUS RACE (payout ${payoutId}, transfer ${transfer.id})`)
    return { outcome: 'transferred' }
  }

  // 通知(transfer成功+CAS成功時のみ1回・失敗しても送金処理自体は成功扱い)
  try {
    const { data: bookingRow } = await supabase
      .from('referral_bookings')
      .select('client_id')
      .eq('id', payout.booking_id)
      .maybeSingle()
    let clientNickname: string | null = null
    if (bookingRow?.client_id) {
      const { data: clientRow } = await supabase
        .from('clients')
        .select('nickname')
        .eq('id', bookingRow.client_id)
        .maybeSingle()
      clientNickname = clientRow?.nickname || null
    }
    const { data: senderPro } = await supabase
      .from('professionals')
      .select('name, contact_email, line_messaging_user_id')
      .eq('id', payout.sender_pro_id)
      .maybeSingle()
    if (senderPro) {
      await notifyReferralPayoutTransferred(
        {
          name: senderPro.name,
          contact_email: senderPro.contact_email,
          line_messaging_user_id: senderPro.line_messaging_user_id,
        },
        payout.amount_jpy,
        clientNickname,
        estimateReferralPayoutReflectionText(paidAtIso)
      )
    }
  } catch (notifyErr) {
    console.error(`[referral-payment] executeReferralPayoutTransfer notify error (payout ${payoutId}):`, notifyErr)
  }

  return { outcome: 'transferred' }
}
