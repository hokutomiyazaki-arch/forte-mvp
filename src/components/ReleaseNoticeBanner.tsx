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
      // §16-41(CEO決定 2026-08-08): クライアントへの記録依頼機能のリリース告知。
      // 告知ごとに変える。使い回すと前回閉じた人に出なくなる。
      id="release-2026-08-08-proof-request"
      type="info"
      title="セッション後、その場にいなくても記録をお願いできます"
      body={
        '完了した予約のカードに「クライアントに記録をお願いする」ボタンが付きました。' +
        'オンラインで担当したお客さまにも、対面のQRと同じように記録をお願いできます。' +
        // §16-41修正C(CEOフィードバック 2026-08-08): 事実に合わせて修正。記録フローには
        // 店頭QRと同じ本人確認(メール6桁コード等)が変わらず存在するため、
        // 「記録後の認証は不要」とは書かない(保護対象の既存確認フローに触れていない)。
        'お客さまはリンクをタップするだけで、店頭のQRと同じ記録画面が開きます' +
        '（暗証番号の入力は不要です）。'
      }
      actionLabel="予約タブを見る"
      href="/dashboard?tab=bookings"
      flush
    />
  )
}
