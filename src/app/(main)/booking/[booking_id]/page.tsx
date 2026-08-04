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
import BookingAcceptForm from '@/components/referral/BookingAcceptForm'

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
    title: 'ご予約の日時選択 | REAL PROOF',
    robots: { index: false, follow: false },
  }
}

export default async function BookingCapabilityPage({
  params,
}: {
  params: Promise<{ booking_id: string }>
}) {
  const { booking_id: bookingId } = await params
  const data = await getBookingCapabilityData(bookingId)

  if (!data) {
    notFound()
  }

  const listUrl = data.listSlug ? `${APP_URL}/r/${data.listSlug}` : null
  const isExpired =
    data.status === 'expired' ||
    data.status === 'cancelled' ||
    (data.status === 'requested' && data.expiresAt ? new Date(data.expiresAt).getTime() < Date.now() : false)

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 40px', background: T.bg, minHeight: '100vh' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 12, letterSpacing: 2, color: T.gold, fontWeight: 700 }}>REAL PROOF</span>
      </div>

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
          <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8 }}>この予約は無効になりました。</p>
        </div>
      )}

      {!isExpired && (data.status === 'confirmed' || data.status === 'completed') && (
        <div
          style={{
            background: T.cardBg,
            border: `1px solid ${T.cardBorder}`,
            borderRadius: 16,
            padding: '24px 20px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8 }}>予約は確定済みです。</p>
          {data.paymentStatus === 'awaiting' && (
            <p style={{ fontSize: 12, color: T.textMuted, marginTop: 8, lineHeight: 1.7 }}>
              お支払いのご案内メールをご確認ください。
            </p>
          )}
        </div>
      )}

      {!isExpired && data.status === 'requested' && data.counterSlots.length > 0 && (
        <BookingAcceptForm bookingId={data.id} receiverProName={data.receiverProName} counterSlots={data.counterSlots} />
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
