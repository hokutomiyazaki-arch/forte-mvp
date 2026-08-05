/**
 * ライフサイクル改善(タスクB・逆指定): クライアントの日時選択ページ
 *
 * - 認証不要(閲覧にauth()を呼ばない)。booking_idは招待トークンと同格の秘匿URL。
 * - クライアントの氏名・電話番号・メールアドレスは一切表示しない(秘匿URLでも第三者閲覧に備える)。
 * - /r/[slug]/page.tsx と同じ「Server Componentから直接lib関数を呼ぶ」流儀を踏襲する
 *   (このページも公開・認証不要ページのため)。
 */

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getBookingCapabilityData } from '@/lib/referral-data'
import { buildGoogleCalendarUrl } from '@/lib/referral-format'
import BookingAcceptForm from '@/components/referral/BookingAcceptForm'
import PaymentLinkButton from '@/components/referral/PaymentLinkButton'
import BookingRescheduleForm from '@/components/referral/BookingRescheduleForm'

export const dynamic = 'force-dynamic'

const APP_URL = 'https://realproof.jp'

const T = {
  bg: '#FAF8F4',
  cardBg: '#FFFFFF',
  cardBorder: '#E8E4DC',
  dark: '#1A1A2E',
  gold: '#C4A35A',
  textSub: '#555555',
  textMuted: '#888888',
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'ご紹介予約の日時選択 | REAL PROOF',
    robots: { index: false, follow: false },
  }
}

export default async function BookingCapabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ booking_id: string }>
  searchParams: Promise<{ payment?: string }>
}) {
  const { booking_id: bookingId } = await params
  const { payment: paymentParam } = await searchParams
  const data = await getBookingCapabilityData(bookingId)

  if (!data) {
    notFound()
  }

  // レビュー指摘(軽微6): paid済み/決済フラグOFF時にキャンセル文言が出ないようにする
  const showCanceledNotice = paymentParam === 'canceled' && data.paymentStatus === 'awaiting'
  const listUrl = data.listSlug ? `${APP_URL}/r/${data.listSlug}` : null
  // ライフサイクル改善(タスクC・2026-08-04・CEO指示): 成立済み表示にGoogleカレンダー追加リンクを添える。
  const calendarUrl = data.confirmedSlotIso
    ? buildGoogleCalendarUrl({
        startIso: data.confirmedSlotIso,
        title: `${data.receiverProName}さんとの紹介予約(REAL PROOF)`,
        location: data.receiverAddress || undefined,
      })
    : null
  const isExpired =
    data.status === 'expired' ||
    data.status === 'cancelled' ||
    (data.status === 'requested' && data.expiresAt ? new Date(data.expiresAt).getTime() < Date.now() : false)

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 40px', background: T.bg, minHeight: '100vh' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 12, letterSpacing: 2, color: T.gold, fontWeight: 700 }}>REAL PROOF</span>
      </div>

      {!isExpired && showCanceledNotice && (
        <div
          style={{
            background: T.cardBg,
            border: `1px solid ${T.cardBorder}`,
            borderRadius: 16,
            padding: '14px 16px',
            marginBottom: 16,
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 12, color: T.textSub, lineHeight: 1.7 }}>
            お支払いはキャンセルされました。下のボタンからやり直せます。
          </p>
        </div>
      )}

      {isExpired && (
        <div
          style={{
            background: T.cardBg,
            border: `1px solid ${T.cardBorder}`,
            borderRadius: 16,
            padding: '24px 20px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8 }}>この紹介予約は無効になりました。</p>
        </div>
      )}

      {!isExpired && (data.status === 'confirmed' || data.status === 'completed') && data.paymentStatus === 'awaiting' && (
        <div
          style={{
            background: T.cardBg,
            border: `1px solid ${T.cardBorder}`,
            borderRadius: 16,
            padding: '24px 20px',
            textAlign: 'center',
          }}
        >
          {/* CEO指摘(2026-08-05・スクショ指摘): 支払い完了までは成立ではないため「確定」ではなく「仮確定」と表記する。 */}
          <p style={{ fontSize: 13, color: T.dark, fontWeight: 700, lineHeight: 1.8 }}>
            日時は仮確定です。予約の成立には予約金のお支払いが必要です。
          </p>
          {data.confirmedSlotText && (
            <p style={{ fontSize: 13, color: T.textSub, marginTop: 10, lineHeight: 1.7 }}>{data.confirmedSlotText}</p>
          )}
          {/* CEO指示(2026-08-05・スクショ指示): イラストで柔らかく。見出しの下・予約金説明ボックスの上。 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/referral-guide/guide-fee.png"
            alt="予約金のしくみ"
            style={{
              display: 'block',
              width: '100%',
              maxWidth: 420,
              height: 'auto',
              margin: '14px auto 0',
              borderRadius: 12,
            }}
          />
          {data.feeAmountJpy !== null && (
            <div
              style={{
                background: T.bg,
                border: `1px solid ${T.cardBorder}`,
                borderRadius: 10,
                padding: '12px 14px',
                marginTop: 14,
                textAlign: 'left',
              }}
            >
              <p style={{ fontSize: 12, color: T.textSub, lineHeight: 1.8, margin: 0 }}>
                予約の成立には予約金(セッション料金の一部・¥{data.feeAmountJpy.toLocaleString('ja-JP')})のお支払いが必要です。
                <br />
                総額は変わりません(当日は残額のみのお支払いです)。
                <br />
                {data.receiverProName}さんの都合でキャンセルとなった場合、予約金は全額返金されます。
                <br />
                クライアント様のご都合によるキャンセルは、セッション開始の72時間前まで全額返金・それ以降は返金いたしかねます。
              </p>
            </div>
          )}
          <PaymentLinkButton bookingId={data.id} />
        </div>
      )}

      {!isExpired && (data.status === 'confirmed' || data.status === 'completed') && data.paymentStatus === 'paid' && (
        <div
          style={{
            background: T.cardBg,
            border: `1px solid ${T.cardBorder}`,
            borderRadius: 16,
            padding: '24px 20px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8 }}>お支払いは完了しています。予約成立済みです。</p>
          {calendarUrl && (
            <a href={calendarUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: T.dark, textDecoration: 'underline', display: 'inline-block', marginTop: 10 }}>
              Googleカレンダーに追加
            </a>
          )}
        </div>
      )}

      {!isExpired &&
        (data.status === 'confirmed' || data.status === 'completed') &&
        data.paymentStatus !== 'awaiting' &&
        data.paymentStatus !== 'paid' && (
          <div
            style={{
              background: T.cardBg,
              border: `1px solid ${T.cardBorder}`,
              borderRadius: 16,
              padding: '24px 20px',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8 }}>紹介予約は確定済みです。</p>
            {calendarUrl && (
              <a href={calendarUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: T.dark, textDecoration: 'underline', display: 'inline-block', marginTop: 10 }}>
                Googleカレンダーに追加
              </a>
            )}
          </div>
        )}

      {!isExpired && data.status === 'requested' && data.counterSlots.length > 0 && (
        <BookingAcceptForm
          bookingId={data.id}
          receiverProName={data.receiverProName}
          counterSlots={data.counterSlots}
          feeAmountJpy={data.feeAmountJpy}
        />
      )}

      {/* ライフサイクル改善(タスクB・2026-08-04・CEO指示): 確定後にプロが日時変更を提案した場合の選択UI。
          支払い状況の表示ブロックとは独立に、追加で表示する(決済有無に関わらず日時変更提案自体は成立する)。 */}
      {!isExpired && data.showRescheduleChoice && (
        <div style={{ marginTop: 16 }}>
          <BookingRescheduleForm
            bookingId={data.id}
            receiverProName={data.receiverProName}
            rescheduleSlots={data.rescheduleSlots}
            currentSlotText={data.confirmedSlotText}
          />
        </div>
      )}

      {!isExpired && data.status === 'requested' && data.counterSlots.length === 0 && (
        <div
          style={{
            background: T.cardBg,
            border: `1px solid ${T.cardBorder}`,
            borderRadius: 16,
            padding: '24px 20px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8 }}>
            {data.receiverProName}さんからの確定のご連絡をお待ちください。
          </p>
        </div>
      )}

      {listUrl && (
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <a href={listUrl} style={{ fontSize: 12, color: T.textMuted, textDecoration: 'underline' }}>
            紹介リストに戻る
          </a>
        </div>
      )}
    </div>
  )
}
