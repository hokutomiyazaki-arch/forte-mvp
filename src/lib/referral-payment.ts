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
} from '@/lib/referral-notify'
import { buildGoogleCalendarUrl, resolveConfirmedSlotIso } from '@/lib/referral-format'
import { REFERRAL_FEE_TOTAL_BPS, REFERRAL_MIN_FEE_JPY, CONFIRM_PAYMENT_DEADLINE_HOURS } from '@/lib/feature-flags'

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
    itemName: `予約フィー（${menuName || 'ご相談'}）`,
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
    itemName: `予約フィー（${params.menuName || 'ご相談'}）`,
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
        `${params.receiverProName}さんとのご相談確定・お支払いのご案内`,
        emailShell(
          'ご相談確定・お支払いのご案内',
          `${params.confirmedSlotText ? `${params.confirmedSlotText} に確定しました。` : 'ご相談の日時が確定しました。'}<br>担当: ${safeReceiverProName}さん<br><br>` +
            `予約フィー ¥${params.feeAmountJpy.toLocaleString()} のお支払いで紹介予約が成立します(24時間以内)。<br>` +
            `当日は残額 ¥${residualJpy.toLocaleString()} を${safeReceiverProName}さんに直接お支払いください(合計 ¥${params.priceJpy.toLocaleString()} は変わりません)。` +
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
            title: `${receiverPro?.name || 'プロ'}さんとのご相談(REAL PROOF)`,
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
