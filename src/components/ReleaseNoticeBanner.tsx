'use client'

import InlineNoticeBanner from '@/components/InlineNoticeBanner'

/**
 * リリース告知バナー（CEO指摘 2026-08-07）。
 *
 * CEO:「admin dashboard 使わなくてもあなたは同じようにバナー通知作れるようにしたでしょ。」
 *   → そのとおり。InlineNoticeBanner（見た目は admin 配信と同一・NoticeBannerShell）が
 *     あるので、**告知はコードで出す**。admin の一斉送信は LINE/メール専用にして、
 *     アプリ内バナーは CC がリリースと同時に載せる（CEOに二度手間をかけない）。
 *
 * 運用ルール（NewBadge と同じ考え方）:
 *   - **出しっぱなしにしない。** UNTIL を過ぎたら自動で消える。
 *     ずっと出ていると、バナーという表示自体が読まれなくなる。
 *   - ✕ で閉じられる（閉じたことは localStorage に残る・InlineNoticeBanner 側の仕組み）。
 *   - 新しいリリースを出すときは **id を変える**。同じ id のままだと、
 *     前回閉じた人には二度と出ない。
 */

/** この日（JST）を過ぎたら出さない。新しい告知を出すときに更新する。 */
const UNTIL = '2026-09-07'

function isStillCurrent(): boolean {
  // JST基準で比較する（UTCで切るとJSTの夜に1日早く消える）
  const todayJst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
  return todayJst <= UNTIL
}

export default function ReleaseNoticeBanner() {
  if (!isStillCurrent()) return null

  return (
    <InlineNoticeBanner
      // 告知ごとに変える。使い回すと前回閉じた人に出なくなる。
      id="release-2026-08-07-booking-consultation"
      type="info"
      title="予約と相談が、REAL PROOFの中で完結します"
      body={
        'カードに「予約する」と「相談する」が付きました。' +
        '予約サイトが無くても今日から予約を受けられます（予約金はかかりません）。' +
        '相談は、いきなり予約するのをためらうお客さんの受け皿です。' +
        '話がまとまったら、チャットからメニューを提案すれば、そのまま予約に進んでもらえます。' +
        'どちらも、受けたくない時期は別々にオフにできます。'
      }
      actionLabel="設定を見る"
      href="/dashboard?tab=bookings"
    />
  )
}
