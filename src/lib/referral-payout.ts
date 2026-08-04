/**
 * §ステージ4(送り手分配・CEO決定・2026-08-04): 紹介案件の完了時に、送り手プロへの分配行
 * (referral_payouts・migration 039)を1回だけ作成する共通処理。
 *
 * 対象条件: status='completed' かつ sender_pro_id IS NOT NULL かつ payment_status='paid'
 * (not_required/null/フラグOFFは分配なし。決済が確認できていない予約金から
 * 分配だけ確定させることはしない。cancelledへの誤計上防止のためstatusも明示的に見る)。
 *
 * 金額(レビュー指摘・重大1で修正): 指示書§2-4(RP_REFERRAL_IMPL_SPEC.md 262-281)どおり、
 * 送り手フィーは price_jpy(セッション価格そのもの)に対する fee_sender_bps
 * (予約ごとに固定・遡及禁止)。例: 価格10,000円・fee_sender_bps=3000(30%) → 送り手3,000円。
 * fee_amount_jpy(このテーブルの監査用カラム)は従来通り price_jpy*fee_total_bps/10000
 * (Stripeで実際に collect した予約金の総額。例3,360円)を保持する(amount_jpyの算出元とは別物)。
 *
 * 計算は §2-10 が要求する「参加者リストを回して配る」形の共通関数
 * src/lib/referral-fee.ts の computeFeeDistribution() 経由で行う(中6も同時解消・
 * Phase 1で呼び出し0件だった関数を最初の実呼び出しにする)。
 * 参加者は [sender(shareBps=fee_sender_bps), receiver(shareBps=10000-fee_sender_bps)] の2人とし、
 * totalJpy=price_jpy で按分する。端数はrole='receiver'側に寄せられる(関数の既定動作)ため、
 * 送り手の取り分が四捨五入で余分に増えることはない。
 *
 * 呼び出し元: bookings/received PATCH complete（受け手の手動完了）、
 * cron/expire-referral-bookings（確定後24h自動完了）の、いずれも
 * status='completed' への更新が「実際に行を更新できた(0行でない)」ことを確認した直後。
 *
 * 冪等性: referral_payouts.booking_id は UNIQUE(migration 039)。23505(unique_violation)は
 * 「既に作成済み」として成功扱いにする。
 * fail-soft: テーブル未作成(42P01)・カラム未反映(PGRST205等)の場合はエラーログ1行のみ残し、
 * 完了処理自体は失敗させない(migration 039 未実行のデプロイでも壊れない)。
 * このファイルはStripeに触らないため独立ファイルにする(referral-payment.tsとチャンクグラフを分ける)。
 */
import { getSupabaseAdmin } from '@/lib/supabase'
import { REFERRAL_FEE_TOTAL_BPS, REFERRAL_SENDER_SHARE_BPS } from '@/lib/feature-flags'
import { computeFeeDistribution } from '@/lib/referral-fee'

/** テーブル/カラム未反映(migration未実行)を示すPostgres/PostgRESTのエラーコード。fail-softの対象。 */
function isMissingSchemaError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  const code = err.code || ''
  // 42P01 = undefined_table / PGRST205 = table not found in schema cache / 42703 = undefined_column
  return code === '42P01' || code === 'PGRST205' || code === '42703'
}

/**
 * 完了した紹介案件(bookingId)が分配対象なら referral_payouts に1行作成する。
 *
 * ステージ4「自動送金」(CEO承認済み・2026-08-05)対応: 呼び出し元(bookings/received PATCH complete・
 * cron/expire-referral-bookings)が続けて executeReferralPayoutTransfer(referral-payment.ts)を
 * 呼べるよう、作成/既に存在した(23505衝突)いずれの場合も payoutId を返す。分配対象外・エラー時は
 * payoutId: null(呼び出し元は送金を試みない・fail-soft・失敗しても完了処理自体は成功のまま)。
 * このファイル自体はStripeに触らない(既存規約通り)。
 */
export async function createReferralPayoutIfEligible(bookingId: string): Promise<{ payoutId: string | null }> {
  try {
    const supabase = getSupabaseAdmin()

    const { data: booking, error: bookingError } = await supabase
      .from('referral_bookings')
      .select('id, status, sender_pro_id, receiver_pro_id, price_jpy, fee_total_bps, fee_sender_bps, payment_status')
      .eq('id', bookingId)
      .maybeSingle()

    if (bookingError) {
      if (isMissingSchemaError(bookingError)) {
        console.error(
          `[referral-payout] createReferralPayoutIfEligible: schema not ready (fail-soft) for booking ${bookingId}:`,
          bookingError.message
        )
        return { payoutId: null }
      }
      console.error(
        `[referral-payout] createReferralPayoutIfEligible: booking fetch error for ${bookingId}:`,
        bookingError.message
      )
      return { payoutId: null }
    }
    if (!booking) return { payoutId: null }

    // レビュー指摘(重大3a): cancelled等への誤計上防止。呼び出し元は完了更新の直後に呼ぶ想定だが、
    // 競合(その間に別経路がcancelledへ進めた等)に備えて必ずstatusを見る。
    if (booking.status !== 'completed') return { payoutId: null }
    // 対象条件: sender_pro_id有り かつ payment_status='paid'。not_required/null/フラグOFFは分配なし。
    if (!booking.sender_pro_id) return { payoutId: null }
    if (booking.payment_status !== 'paid') return { payoutId: null }
    if (!(booking.price_jpy > 0)) return { payoutId: null }

    // レビュー指摘(重大2): 予約ごとに固定された fee_sender_bps を使う(遡及適用禁止・指示書:275)。
    const feeSenderBps = booking.fee_sender_bps ?? REFERRAL_SENDER_SHARE_BPS
    if (!(feeSenderBps > 0) || feeSenderBps >= 10000) return { payoutId: null }

    const distribution = computeFeeDistribution(booking.price_jpy, [
      { proId: booking.sender_pro_id, role: 'sender', shareBps: feeSenderBps },
      { proId: booking.receiver_pro_id, role: 'receiver', shareBps: 10000 - feeSenderBps },
    ])
    const senderShare = distribution.find((d) => d.role === 'sender')
    const amountJpy = senderShare?.amountJpy ?? 0
    if (amountJpy <= 0) return { payoutId: null }

    // 監査用: Stripeで実際に collect した予約金の総額(price_jpy*fee_total_bps/10000)。
    // amount_jpy(送り手取り分)とは別の値。fee_total_bps未設定行はREFERRAL_FEE_TOTAL_BPSへフォールバック。
    const feeTotalBps = booking.fee_total_bps ?? REFERRAL_FEE_TOTAL_BPS
    const feeAmountJpy = Math.floor((booking.price_jpy * feeTotalBps) / 10000)

    const { data: insertedRows, error: insertError } = await supabase
      .from('referral_payouts')
      .insert({
        booking_id: booking.id,
        sender_pro_id: booking.sender_pro_id,
        receiver_pro_id: booking.receiver_pro_id,
        amount_jpy: amountJpy,
        fee_amount_jpy: feeAmountJpy,
      })
      .select('id')

    if (insertError) {
      // 23505 = unique_violation(booking_id UNIQUE) → 既に作成済み。冪等に成功扱い。
      // ステージ4「自動送金」対応: 呼び出し元が送金を試みられるよう、既存行のidを再SELECTして返す。
      if ((insertError as { code?: string }).code === '23505') {
        const { data: existing } = await supabase
          .from('referral_payouts')
          .select('id')
          .eq('booking_id', booking.id)
          .maybeSingle()
        return { payoutId: existing?.id || null }
      }
      if (isMissingSchemaError(insertError)) {
        console.error(
          `[referral-payout] createReferralPayoutIfEligible: schema not ready on insert (fail-soft) for booking ${bookingId}:`,
          insertError.message
        )
        return { payoutId: null }
      }
      console.error(
        `[referral-payout] createReferralPayoutIfEligible: insert error for booking ${bookingId}:`,
        insertError.message
      )
      return { payoutId: null }
    }

    return { payoutId: insertedRows?.[0]?.id || null }
  } catch (err) {
    console.error(`[referral-payout] createReferralPayoutIfEligible: unexpected error for booking ${bookingId}:`, err)
    return { payoutId: null }
  }
}
