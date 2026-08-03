import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { notifyBookingExpiredToSender, notifyClientByEmail, emailShell, escapeHtml } from '@/lib/referral-notify'
import { isReferralPaymentEnabled } from '@/lib/feature-flags'
// 中1レビュー指摘: Stripe importはこのAPI routeに持たせない(Webpackチャンクグラフ対策)。
// PaymentIntentキャンセルはsrc/lib/referral-payment.tsの関数呼び出しに委譲する。
import { cancelReferralAuthorization } from '@/lib/referral-payment'

export const dynamic = 'force-dynamic'

const APP_URL = 'https://realproof.jp'
const BATCH_LIMIT = 100
/** 軽微指摘: Checkoutセッションは24hで自然失効するため、25h(バッファ込み)経過したdraftはゴミ行とみなす */
const DRAFT_STALE_HOURS = 25
const DRAFT_CLEANUP_LIMIT = 100

/**
 * §2-4: requested のまま48時間(expires_at)を超えた予約リクエストを自動失効させる。
 * クライアントと送り手プロへ通知し、別候補提案としてリストURLを添える。
 * Vercel Cron から毎時呼び出す(vercel.json)。
 *
 * §2-4ステージ2(決済有効時のみ・migration 036依存): payment_status='authorized'のまま
 * 期限切れになった予約は、失効と同時にStripeのPaymentIntentをキャンセルし与信を解放する
 * (referral_bookings.payment_status/stripe_payment_intent_idはREFERRAL_STRIPE_SECRET_KEY
 * 未設定の間は一切参照しない=フラグゲート)。
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const nowIso = new Date().toISOString()
  const paymentEnabled = isReferralPaymentEnabled()
  const baseSelect =
    'id, list_id, sender_pro_id, receiver_pro_id, client_id, client_email, status, expires_at, clients(id, user_id, nickname), referral_lists(slug)'
  const selectFields = paymentEnabled ? `${baseSelect}, payment_status, stripe_payment_intent_id` : baseSelect

  // 軽微指摘: 決済経路のdraftのまま25h(Checkoutセッションの24h自然失効+バッファ)経過した
  // 「ゴミ行」を掃除する(通知なし・ログのみ。ユーザーには何も届いていないため通知不要)。
  // paymentEnabled(migration 036依存カラム)の間だけ実行する(フラグゲート)。
  // メインの失効処理より前に実行しても後でも影響しないため、失敗しても本処理を止めない。
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

        // §2-4ステージ2: オーソリ済み(与信確保済み)のまま失効した予約はPaymentIntentをキャンセルし
        // 与信を解放する。キャンセル失敗はcancelReferralAuthorization内でログのみ(オーソリはStripe側で
        // 自然失効するため致命的でない)。※draft方式のためこのcron対象(status='requested')に
        // draftは含まれない(draft中に失効した場合の与信解放はStripe側の自動失効に委ねる)。
        if (paymentEnabled && row.payment_status === 'authorized' && row.stripe_payment_intent_id) {
          await cancelReferralAuthorization(row.stripe_payment_intent_id)
        }

        const slug = row.referral_lists?.slug || ''
        const listUrl = slug ? `${APP_URL}/r/${slug}` : APP_URL
        const receiverName = proMap[row.receiver_pro_id]?.name || 'プロ'
        const clientNickname = row.clients?.nickname || 'クライアント'
        const clientUserId = row.clients?.user_id || ''
        const clientEmail = row.client_email || null

        // クライアントへ通知(失敗しても失効処理自体は成功扱い)
        try {
          if (clientUserId || clientEmail) {
            await notifyClientByEmail(
              { userId: clientUserId, email: clientEmail },
              '予約リクエストが失効しました',
              emailShell(
                '予約リクエスト失効のお知らせ',
                `${escapeHtml(receiverName)}さんへのご相談リクエストは、48時間以内に確定のご連絡がなかったため失効しました。<br>他の先生もご紹介できますので、よろしければご覧ください。`,
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
              listUrl
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
