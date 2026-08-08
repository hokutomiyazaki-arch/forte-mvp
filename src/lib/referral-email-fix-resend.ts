/**
 * §17-16(2026-08-06): メールアドレスを直したあと、クライアントへ「いま必要な案内」を送り直す。
 *
 * §17-10 で受け手側(/api/referral/bookings/received)に書いたものを、送り手側
 * (/api/referral/bookings/sent)からも同じ内容で呼べるように切り出した。
 * 「ほとんど同じだけど少し違う」実装をコピペで2本持つと必ずズレる(CLAUDE.md §G)。
 *
 * 送り直す中身は状況で変わる:
 *   確定済み・予約金が未払い → **予約金の支払いリンク**（これが届かないと予約が成立しない）
 *   確定前                   → 受付メール
 *   確定済み・予約金なし     → 確定のお知らせ
 *
 * 差出人として名乗るのは常に**受け手プロ**（クライアントが予約した相手）。
 * 送り手が直した場合でも担当者名は変えない。
 */

import {
  notifyBookingReceivedToClient,
  notifyClientByEmail,
  emailShell,
  escapeHtml,
} from '@/lib/referral-notify'
import { formatSlotWithWeekday, resolveConfirmedSlotIso } from '@/lib/referral-format'
import { isReferralPaymentEnabled, REFERRAL_MIN_FEE_JPY, REFERRAL_FEE_TOTAL_BPS } from '@/lib/feature-flags'
import { issueFeePaymentLinkAndNotify } from '@/lib/referral-payment'

// 外部に配るURLは origin ではなくハードコード（preview デプロイのURLが顧客に届くのを防ぐ）
const APP_URL = 'https://realproof.jp'

export interface ResendAfterEmailFixInput {
  bookingId: string
  status: string
  priceJpy: number
  paymentStatus: string | null
  feeTotalBps: number | null
  menuName: string | null
  preferredSlots: Record<string, unknown> | null
  listSlug: string | null
  clientEmail: string
  clientUserId: string | null
  receiverProName: string
}

export async function resendClientGuidanceAfterEmailFix(
  input: ResendAfterEmailFixInput,
): Promise<boolean> {
  const paymentEnabled = isReferralPaymentEnabled()
  const listUrl = input.listSlug ? `${APP_URL}/r/${input.listSlug}` : APP_URL
  const feeTotalBps = input.feeTotalBps ?? REFERRAL_FEE_TOTAL_BPS
  const feeAmountJpy = input.priceJpy > 0 ? Math.floor((input.priceJpy * feeTotalBps) / 10000) : 0
  const needsFeePayment =
    paymentEnabled &&
    input.status === 'confirmed' &&
    (input.paymentStatus === 'awaiting' || input.paymentStatus === 'unpaid') &&
    input.priceJpy > 0 &&
    feeAmountJpy >= REFERRAL_MIN_FEE_JPY

  try {
    if (needsFeePayment) {
      const result = await issueFeePaymentLinkAndNotify({
        bookingId: input.bookingId,
        priceJpy: input.priceJpy,
        feeAmountJpy,
        menuName: input.menuName,
        clientEmail: input.clientEmail,
        clientUserId: input.clientUserId,
        receiverProName: input.receiverProName,
        confirmedSlotText: formatSlotWithWeekday(resolveConfirmedSlotIso(input.preferredSlots as any)),
        successUrl: `${listUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${APP_URL}/booking/${input.bookingId}?payment=canceled`,
        listUrl,
      })
      return result.success
    }

    if (input.status === 'requested') {
      const receipt = await notifyBookingReceivedToClient(
        { userId: input.clientUserId || '', email: input.clientEmail },
        input.receiverProName,
        listUrl,
        { paymentFlowActive: paymentEnabled && input.paymentStatus === 'unpaid' },
      )
      return receipt.sent
    }

    const slotText = formatSlotWithWeekday(resolveConfirmedSlotIso(input.preferredSlots as any))
    const result = await notifyClientByEmail(
      { userId: input.clientUserId || '', email: input.clientEmail },
      `${input.receiverProName}さんとのご予約が確定しました`,
      emailShell(
        'ご予約確定のお知らせ',
        `${slotText ? `${escapeHtml(slotText)} に確定しています。` : 'ご予約の日時が確定しています。'}<br>` +
          `担当: ${escapeHtml(input.receiverProName)}さん`,
      ),
    )
    return result.sent
  } catch (err) {
    console.error('[referral-email-fix-resend] error:', err)
    return false
  }
}
