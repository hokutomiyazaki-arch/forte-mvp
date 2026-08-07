'use client'

import InlineNoticeBanner from '@/components/InlineNoticeBanner'
import { useProStatus } from '@/lib/useProStatus'

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
 *
 * 置き場所（CEO指摘 2026-08-07「バナーを出す位置がちがう！！admindashboardを確認して！！」）:
 *   admin配信のお知らせ(AnnouncementBanner)は **(main)/layout.tsx の Navbar 直下・<main> の外**に
 *   敷かれている。ページ本文の中ではない。同じ位置・同じ全幅の帯にするため、
 *   このバナーもレイアウト側でマウントし flush で余白を持たせない。
 *
 * 出す相手: 中身がプロ向け（カードの設定の話）なので、**プロにだけ**出す。
 *   クライアントが見ている画面に出しても意味が無いどころか邪魔になる。
 *
 * 文言の線引き（CEO指摘 2026-08-07「紹介機能の事は公開してないのに予約金とか説明してるの意味不明」）:
 *   **まだ公開していない機能の用語を、告知に混ぜない。**
 *   予約金・紹介リスト・紹介報酬は、いずれも紹介機能(FEATURE_REFERRAL_LISTS)の中の概念で、
 *   先行公開のアローリストに入っていないプロには**画面のどこにも出てこない**。
 *   「予約金はかかりません」と書いても、予約金を知らない人には意味が通らないどころか
 *   「予約金って何？お金がかかるの？」という不安だけが残る。
 *   全体公開(isReferralFullyLaunched)まで、この告知では紹介まわりに一切触れない。
 */

/** この日（JST）を過ぎたら出さない。新しい告知を出すときに更新する。 */
const UNTIL = '2026-09-07'

function isStillCurrent(): boolean {
  // JST基準で比較する（UTCで切るとJSTの夜に1日早く消える）
  const todayJst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
  return todayJst <= UNTIL
}

export default function ReleaseNoticeBanner() {
  const { isPro } = useProStatus()

  if (!isStillCurrent()) return null
  // isPro === null は判定中。確定するまで出さない（チラつき防止）。
  if (isPro !== true) return null

  return (
    <InlineNoticeBanner
      // 告知ごとに変える。使い回すと前回閉じた人に出なくなる。
      id="release-2026-08-07-booking-consultation-v2"
      type="info"
      title="予約と相談を、カードから直接受けられます"
      body={
        'カードに「予約する」と「相談する」が付きました。' +
        '予約サイトをお持ちでなくても、今日からカードで予約を受けられます。' +
        'ご自分の予約サイトを使っている先生は、どちらを使うか選べます。' +
        '相談は「いきなり予約するのはちょっと」というお客さんの受け皿です。' +
        '話がまとまったら、チャットからメニューを提案すれば、そのまま予約に進んでもらえます。' +
        'どちらも、受けたくない時期は別々にオフにできます。'
      }
      actionLabel="設定を見る"
      href="/dashboard?tab=bookings"
      flush
    />
  )
}
