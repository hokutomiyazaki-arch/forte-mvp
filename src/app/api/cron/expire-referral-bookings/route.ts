import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  notifyBookingExpiredToSender,
  notifyBookingPaymentExpiredToPro,
  notifyClientByEmail,
  emailShell,
  escapeHtml,
} from '@/lib/referral-notify'
import { formatSlot } from '@/lib/referral-format'
import {
  isReferralPaymentEnabled,
  REFERRAL_MIN_FEE_JPY,
  REFERRAL_FEE_TOTAL_BPS,
  CONFIRM_PAYMENT_DEADLINE_HOURS,
} from '@/lib/feature-flags'
// 中1レビュー指摘: 「決済リンク発行+メール送付」はconfirm時(received PATCH)とこのcronの
// 再試行ブロックの両方から同じ関数を呼ぶ(同じ処理を2箇所に書かない)。
// 軽微5レビュー指摘: 24hキャンセル時にセッションを明示失効させる関数も同様に委譲する。
import { issueFeePaymentLinkAndNotify, expireReferralCheckoutSession } from '@/lib/referral-payment'

export const dynamic = 'force-dynamic'

const APP_URL = 'https://realproof.jp'
const BATCH_LIMIT = 100
/** 軽微指摘: Checkoutセッションは24hで自然失効するため、25h(バッファ込み)経過したdraftはゴミ行とみなす */
const DRAFT_STALE_HOURS = 25
const DRAFT_CLEANUP_LIMIT = 100
// CONFIRM_PAYMENT_DEADLINE_HOURS(確定後の予約フィー決済猶予・24h)は
// src/lib/feature-flags.ts に集約(getOrCreateFeePaymentLinkの期限判定と共有・レビュー指摘・中5)。
const CONFIRM_PAYMENT_CLEANUP_LIMIT = 100
/**
 * レビュー指摘(中1): confirm時のCheckout作成失敗等でconfirmed×unpaidのまま取り残された予約を
 * 再試行する(confirm時と同じ関数で決済リンクを再発行)。10分の猶予はconfirm直後の正常系
 * (issueFeePaymentLinkAndNotifyがまだ処理中)との競合を避けるため。
 */
const PAYMENT_LINK_RETRY_DEADLINE_MIN = 10
const PAYMENT_LINK_RETRY_LIMIT = 20

/**
 * §2-4: requested のまま48時間(expires_at)を超えた予約リクエストを自動失効させる。
 * クライアントと送り手プロへ通知し、別候補提案としてリストURLを添える。
 * Vercel Cron から毎時呼び出す(vercel.json)。
 *
 * §2-4ステージ3(予約フィー方式への刷新): 与信(オーソリ)方式は廃止済みのため、この関数内で
 * PaymentIntentのキャンセル処理は行わない。代わりに、確定(confirmed)後24時間以内に予約フィーの
 * 支払いが無かった予約を自動キャンセルする専用ブロックを追加する(下記)。
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const nowIso = new Date().toISOString()
  const paymentEnabled = isReferralPaymentEnabled()
  // レビューFAIL修正(中2): counter_slots(逆指定)の有無で48h失効メールの文言を分岐するため、
  // preferred_slotsも取得する。
  const selectFields =
    'id, list_id, sender_pro_id, receiver_pro_id, client_id, client_email, status, expires_at, preferred_slots, clients(id, user_id, nickname), referral_lists(slug)'

  // 軽微指摘: 決済経路のdraftのまま25h(Checkoutセッションの24h自然失効+バッファ)経過した
  // 「ゴミ行」を掃除する(通知なし・ログのみ。ユーザーには何も届いていないため通知不要)。
  // §2-4ステージ3(予約フィー方式)ではdraftはもう作られないが、旧ステージ2実装時の
  // 残存draft行を回収するため、このブロックは残す(paymentEnabled=migration 036依存カラムの間だけ実行)。
  if (paymentEnabled) {
    try {
      const staleBefore = new Date(Date.now() - DRAFT_STALE_HOURS * 60 * 60 * 1000).toISOString()
      const { data: staleDrafts, error: staleQueryError } = await supabase
        .from('referral_bookings')
        .select('id')
        .eq('status', 'draft')
        .lt('created_at', staleBefore)
        .limit(DRAFT_CLEANUP_LIMIT)

      if (staleQueryError) {
        console.error('[cron/expire-referral-bookings] stale draft query error:', staleQueryError.message)
      } else if (staleDrafts && staleDrafts.length > 0) {
        const { data: cleanedRows, error: staleUpdateError } = await supabase
          .from('referral_bookings')
          .update({ payment_status: 'canceled', status: 'cancelled' })
          .in('id', staleDrafts.map((d) => d.id))
          .eq('status', 'draft')
          .select('id')

        if (staleUpdateError) {
          console.error('[cron/expire-referral-bookings] stale draft cleanup error:', staleUpdateError.message)
        } else {
          console.log(`[cron/expire-referral-bookings] cleaned up ${cleanedRows?.length || 0} stale draft booking(s)`)
        }
      }
    } catch (staleErr) {
      console.error('[cron/expire-referral-bookings] stale draft cleanup unexpected error:', staleErr)
    }
  }

  // §2-4ステージ3(予約フィー方式・CEO決定): confirmed×awaitingのまま24時間(confirmed_atから)を
  // 超えた予約は、予約フィーの支払いが確認できなかったものとして自動キャンセルする
  // (クライアント・受け手・送り手へ通知)。paymentEnabled(migration 036依存カラム)の間だけ実行する。
  if (paymentEnabled) {
    try {
      const paymentDeadline = new Date(Date.now() - CONFIRM_PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000).toISOString()
      const { data: unpaidConfirmed, error: unpaidQueryError } = await supabase
        .from('referral_bookings')
        .select(
          'id, sender_pro_id, receiver_pro_id, client_email, confirmed_at, stripe_checkout_session_id, clients(id, user_id, nickname), referral_lists(slug)'
        )
        .eq('status', 'confirmed')
        .eq('payment_status', 'awaiting')
        .lt('confirmed_at', paymentDeadline)
        .limit(CONFIRM_PAYMENT_CLEANUP_LIMIT)

      if (unpaidQueryError) {
        console.error('[cron/expire-referral-bookings] unpaid confirmed query error:', unpaidQueryError.message)
      } else if (unpaidConfirmed && unpaidConfirmed.length > 0) {
        const rows2 = unpaidConfirmed as any[]
        const proIds2 = Array.from(
          new Set(rows2.flatMap((r) => [r.sender_pro_id, r.receiver_pro_id]).filter((id): id is string => !!id))
        )
        let proMap2: Record<
          string,
          { id: string; name: string; contact_email: string | null; line_messaging_user_id: string | null }
        > = {}
        if (proIds2.length > 0) {
          const { data: pros2 } = await supabase
            .from('professionals')
            .select('id, name, contact_email, line_messaging_user_id')
            .in('id', proIds2)
          for (const p of (pros2 || []) as any[]) {
            proMap2[p.id] = p
          }
        }

        for (const row of rows2) {
          try {
            const { data: updatedRows2, error: updateError2 } = await supabase
              .from('referral_bookings')
              .update({ status: 'cancelled', payment_status: 'canceled' })
              .eq('id', row.id)
              .eq('status', 'confirmed')
              .eq('payment_status', 'awaiting')
              .select('id')

            if (updateError2) {
              console.error(
                `[cron/expire-referral-bookings] unpaid confirmed cancel error for ${row.id}:`,
                updateError2.message
              )
              continue
            }
            if (!updatedRows2 || updatedRows2.length === 0) {
              // 既に他経路(支払い完了等)で状態が変わっていた場合はスキップ
              continue
            }

            // レビュー指摘(軽微5): キャンセル済み予約への課金を構造的に防ぐため、該当の
            // Checkout Sessionを明示失効させる(失敗はexpireReferralCheckoutSession内でログのみ)。
            if (row.stripe_checkout_session_id) {
              await expireReferralCheckoutSession(row.stripe_checkout_session_id)
            }

            const clientNickname = row.clients?.nickname || 'クライアント'
            const clientUserId = row.clients?.user_id || ''
            const clientEmail = row.client_email || null
            const slug = row.referral_lists?.slug || ''
            const listUrl = slug ? `${APP_URL}/r/${slug}` : APP_URL

            try {
              if (clientUserId || clientEmail) {
                await notifyClientByEmail(
                  { userId: clientUserId, email: clientEmail },
                  'お支払いが確認できなかったため紹介予約はキャンセルされました',
                  emailShell(
                    '紹介予約キャンセルのお知らせ',
                    'お支払いが確認できなかったため、紹介予約は自動的にキャンセルされました。<br>ご希望の際は再度お申し込みください。',
                    '他の先生を見る',
                    listUrl
                  )
                )
              }
            } catch (notifyErr) {
              console.error(`[cron/expire-referral-bookings] unpaid confirmed client notify error for ${row.id}:`, notifyErr)
            }

            try {
              const receiverInfo = proMap2[row.receiver_pro_id]
              if (receiverInfo) {
                await notifyBookingPaymentExpiredToPro(
                  {
                    name: receiverInfo.name,
                    contact_email: receiverInfo.contact_email,
                    line_messaging_user_id: receiverInfo.line_messaging_user_id,
                  },
                  clientNickname
                )
              }
              const senderInfo = row.sender_pro_id ? proMap2[row.sender_pro_id] : null
              if (senderInfo) {
                await notifyBookingPaymentExpiredToPro(
                  {
                    name: senderInfo.name,
                    contact_email: senderInfo.contact_email,
                    line_messaging_user_id: senderInfo.line_messaging_user_id,
                  },
                  clientNickname
                )
              }
            } catch (notifyErr) {
              console.error(`[cron/expire-referral-bookings] unpaid confirmed pro notify error for ${row.id}:`, notifyErr)
            }
          } catch (rowErr) {
            console.error(`[cron/expire-referral-bookings] unpaid confirmed row error for ${row.id}:`, rowErr)
          }
        }
      }
    } catch (unpaidErr) {
      console.error('[cron/expire-referral-bookings] unpaid confirmed cleanup unexpected error:', unpaidErr)
    }
  }

  // レビュー指摘(中1): confirm時のCheckout作成失敗等でconfirmed×unpaidのまま取り残された予約を
  // 再試行する(confirm時と同じ関数issueFeePaymentLinkAndNotifyで決済リンクを再発行)。
  // 上限20件・失敗はissueFeePaymentLinkAndNotify内でログのみ(次回cronで再試行される)。
  if (paymentEnabled) {
    try {
      const retryDeadline = new Date(Date.now() - PAYMENT_LINK_RETRY_DEADLINE_MIN * 60 * 1000).toISOString()
      // レビュー指摘(R2中1): 24hキャンセルの基準はconfirmed_atのため、古い行にリンクを発行すると
      // 直後の24hキャンセルブロックに拾われ「案内→即キャンセル」になる。再試行は確定から12時間以内に
      // 限定し、リンクを受け取ったクライアントに最低12時間の支払い猶予を保証する(それ以前の
      // 取り残しは自動処理せずログで人手対応)。
      const retryFloor = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
      const { data: unpaidStuck, error: stuckQueryError } = await supabase
        .from('referral_bookings')
        .select(
          'id, receiver_pro_id, client_email, price_jpy, fee_total_bps, menu_id, preferred_slots, confirmed_at, clients(id, user_id), referral_lists(slug), pro_menus(name)'
        )
        .eq('status', 'confirmed')
        .eq('payment_status', 'unpaid')
        .lt('confirmed_at', retryDeadline)
        .gt('confirmed_at', retryFloor)
        .limit(PAYMENT_LINK_RETRY_LIMIT)

      if (stuckQueryError) {
        console.error('[cron/expire-referral-bookings] unpaid confirmed retry query error:', stuckQueryError.message)
      } else if (unpaidStuck && unpaidStuck.length > 0) {
        const rows3 = unpaidStuck as any[]
        const receiverIds3 = Array.from(new Set(rows3.map((r) => r.receiver_pro_id).filter(Boolean)))
        let receiverMap3: Record<string, { name: string }> = {}
        if (receiverIds3.length > 0) {
          const { data: receivers3 } = await supabase.from('professionals').select('id, name').in('id', receiverIds3)
          for (const p of (receivers3 || []) as any[]) {
            receiverMap3[p.id] = p
          }
        }

        for (const row of rows3) {
          try {
            const feeTotalBps = row.fee_total_bps ?? REFERRAL_FEE_TOTAL_BPS
            const feeAmountJpy = row.price_jpy > 0 ? Math.floor((row.price_jpy * feeTotalBps) / 10000) : 0
            if (feeAmountJpy < REFERRAL_MIN_FEE_JPY) {
              // フィーがStripe最低決済額未満(想定外・データ不整合)。決済対象外のため再試行しない。
              continue
            }

            const slug = row.referral_lists?.slug || ''
            const listUrl = slug ? `${APP_URL}/r/${slug}` : APP_URL
            const slots = Array.isArray(row.preferred_slots?.slots) ? row.preferred_slots.slots : []
            const confirmedIdx =
              typeof row.preferred_slots?.confirmed_index === 'number' ? row.preferred_slots.confirmed_index : null
            const confirmedSlotText =
              confirmedIdx !== null && slots[confirmedIdx] ? formatSlot(slots[confirmedIdx]) : null
            const receiverName = receiverMap3[row.receiver_pro_id]?.name || 'プロ'

            await issueFeePaymentLinkAndNotify({
              bookingId: row.id,
              priceJpy: row.price_jpy,
              feeAmountJpy,
              menuName: row.pro_menus?.name || null,
              clientEmail: row.client_email || null,
              clientUserId: row.clients?.user_id || null,
              receiverProName: receiverName,
              confirmedSlotText,
              successUrl: `${listUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
              // バグ報告(2026-08-04)対応: キャンセル後の戻り先を予約ページに変更(再開の「お支払いに進む」ボタンがある)
              cancelUrl: `${APP_URL}/booking/${row.id}?payment=canceled`,
              listUrl,
            })
            // 成否はissueFeePaymentLinkAndNotify内でログ済み。失敗時もここでは握って次回cronに委ねる。
          } catch (rowErr) {
            console.error(`[cron/expire-referral-bookings] unpaid confirmed retry row error for ${row.id}:`, rowErr)
          }
        }
      }
    } catch (retryErr) {
      console.error('[cron/expire-referral-bookings] unpaid confirmed retry unexpected error:', retryErr)
    }
  }

  try {
    const { data: targets, error: queryError } = await supabase
      .from('referral_bookings')
      .select(selectFields)
      .eq('status', 'requested')
      .lt('expires_at', nowIso)
      .limit(BATCH_LIMIT)

    if (queryError) {
      console.error('[cron/expire-referral-bookings] query error:', queryError.message)
      return NextResponse.json({ error: queryError.message }, { status: 500 })
    }

    const rows = (targets || []) as any[]
    console.log(`[cron/expire-referral-bookings] found ${rows.length} target(s) to expire`)

    if (rows.length === 0) {
      return NextResponse.json({ expired: 0, checked: 0 })
    }

    // referral_bookings は professionals への FK が2本(sender/receiver)あり embed が曖昧になるため、
    // 別クエリで名前だけ取得する(reward-reminder cron と同じ回避方針)。
    const proIds = Array.from(
      new Set(
        rows.flatMap((r) => [r.sender_pro_id, r.receiver_pro_id]).filter((id): id is string => !!id)
      )
    )
    let proMap: Record<string, { id: string; name: string; contact_email: string | null; line_messaging_user_id: string | null }> = {}
    if (proIds.length > 0) {
      const { data: pros } = await supabase
        .from('professionals')
        .select('id, name, contact_email, line_messaging_user_id')
        .in('id', proIds)
      for (const p of (pros || []) as any[]) {
        proMap[p.id] = p
      }
    }

    let expiredCount = 0

    for (const row of rows) {
      try {
        // 軽微指摘: count:'exact' はSupabaseクライアント実装差でnullを返すことがあり、
        // 通知が飛ばない事故につながる。.select('id')で返る実行行数で成否を判定する。
        const { data: updatedRows, error: updateError } = await supabase
          .from('referral_bookings')
          .update({ status: 'expired' })
          .eq('id', row.id)
          .eq('status', 'requested')
          .select('id')

        if (updateError) {
          console.error(`[cron/expire-referral-bookings] update error for ${row.id}:`, updateError.message)
          continue
        }
        if (!updatedRows || updatedRows.length === 0) {
          // 既に他経路(受け手のPATCH等)で状態が変わっていた場合はスキップ
          continue
        }
        expiredCount++

        const slug = row.referral_lists?.slug || ''
        const listUrl = slug ? `${APP_URL}/r/${slug}` : APP_URL
        const receiverName = proMap[row.receiver_pro_id]?.name || 'プロ'
        const clientNickname = row.clients?.nickname || 'クライアント'
        const clientUserId = row.clients?.user_id || ''
        const clientEmail = row.client_email || null
        // レビューFAIL修正(中2): counter_slots(逆指定の提案)が有る状態で失効した場合、
        // 「受け手が確定しなかった」ではなく「クライアントが提案日時に返答しなかった」が真因のため
        // 文言を分岐する(事実と逆の通知を防ぐ)。
        const hadCounterProposal = (row.preferred_slots?.counter_slots?.length || 0) > 0

        // クライアントへ通知(失敗しても失効処理自体は成功扱い)
        try {
          if (clientUserId || clientEmail) {
            await notifyClientByEmail(
              { userId: clientUserId, email: clientEmail },
              '紹介予約のリクエストが失効しました',
              emailShell(
                '紹介予約リクエスト失効のお知らせ',
                hadCounterProposal
                  ? `${escapeHtml(receiverName)}さんからご提案した日時へのご返答が48時間以内に確認できなかったため、紹介予約のリクエストは失効しました。<br>他の先生もご紹介できますので、よろしければご覧ください。`
                  : `${escapeHtml(receiverName)}さんへのご相談リクエストは、48時間以内に確定のご連絡がなかったため失効しました。<br>他の先生もご紹介できますので、よろしければご覧ください。`,
                '他の先生を見る',
                listUrl
              )
            )
          }
        } catch (notifyErr) {
          console.error(`[cron/expire-referral-bookings] client notify error for ${row.id}:`, notifyErr)
        }

        // 送り手プロへ通知
        try {
          const senderInfo = row.sender_pro_id ? proMap[row.sender_pro_id] : null
          if (senderInfo) {
            await notifyBookingExpiredToSender(
              {
                name: senderInfo.name,
                contact_email: senderInfo.contact_email,
                line_messaging_user_id: senderInfo.line_messaging_user_id,
              },
              clientNickname,
              receiverName,
              listUrl,
              { hadCounterProposal }
            )
          }
        } catch (notifyErr) {
          console.error(`[cron/expire-referral-bookings] sender notify error for ${row.id}:`, notifyErr)
        }
      } catch (rowErr) {
        console.error(`[cron/expire-referral-bookings] row error for ${row.id}:`, rowErr)
      }
    }

    return NextResponse.json({ expired: expiredCount, checked: rows.length })
  } catch (err) {
    console.error('[cron/expire-referral-bookings] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
