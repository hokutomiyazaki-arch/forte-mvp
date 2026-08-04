/**
 * リフェラル関連の通知(プロ向け・クライアント向け)
 *
 * プロ向け: LINE push(line_messaging_user_id あり)優先 → なければ contact_email へ Resend
 *          → 両方無ければスキップ。
 * クライアント向け: メールをDBに保存せず、Clerk Backend API(clerkClient)で user_id から
 *          都度取得して Resend 送信する(§2-4)。
 *
 * 通知の成否は呼び出し元の主処理(ピン追加・予約リクエスト等)の成否に影響させない
 * (呼び出し側で try/catch する前提)。
 *
 * PII注意: 通知文面に normalized_email 等は含めない。
 */

import { clerkClient } from '@clerk/nextjs/server'
import { sendLinePushText } from '@/lib/line-push'

const APP_URL = 'https://realproof.jp'

/**
 * メールHTML本文に埋め込むユーザー由来文字列(プロ名・クライアントニックネーム・
 * リストのcomment等)は必ずこれを通す(中3レビュー指摘: HTMLインジェクション対策)。
 * LINEテキストはHTML解釈されないため対象外。
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface ProNotifyTarget {
  name: string
  contact_email: string | null
  line_messaging_user_id: string | null
}

/**
 * CEO決定(2026-08-04): 成立時のクライアント宛メールに、受け手プロの場所・連絡先を自動掲載する。
 * 開示タイミング厳守: 呼ぶのは成立時(paid または not_required 確定)のメールのみ
 * (決済リンク案内メール・リクエスト受付メールでは呼ばない)。
 */
export interface ProAccessInfo {
  address: string | null
  nearest_station: string | null
  walk_minutes: number | null
  access_note: string | null
  google_maps_url: string | null
  booking_url: string | null
  website_url: string | null
  phone_number: string | null
  contact_email: string | null
}

/**
 * 場所情報が1件でも設定済みか(レビュー重大1: contact_emailはほぼ全プロ非nullのため、
 * 連絡先込みの「全未設定」判定ではフォールバック文が実質発火しない。場所と連絡先を分離)。
 */
export function hasProLocationInfo(pro: ProAccessInfo): boolean {
  return !!(pro.address || pro.nearest_station || pro.access_note || pro.google_maps_url)
}

/** メールhref用: http/https以外のスキームは掲載しない(escapeHtmlはスキーム検証をしないため)。 */
function safeHttpUrl(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null
}

/**
 * クライアント宛成立メールに埋め込む「当日のご案内 + ご連絡先」HTML。
 * 未設定の項目は行を出さない。場所が全て未設定なら「担当の先生からご連絡があります」を必ず出す
 * (連絡先はあれば併記)。emailShellのbodyHtmlは<p>内に入るため、ブロック要素を使わず<br>連結で組む。
 */
export function buildBookingLocationContactHtml(pro: ProAccessInfo): string {
  const locationLines: string[] = []
  if (pro.address) locationLines.push(escapeHtml(pro.address))
  if (pro.nearest_station) {
    const walk = typeof pro.walk_minutes === 'number' && pro.walk_minutes > 0 ? ` (徒歩${pro.walk_minutes}分)` : ''
    locationLines.push(`${escapeHtml(pro.nearest_station)}${walk}`)
  }
  if (pro.access_note) locationLines.push(escapeHtml(pro.access_note))
  const mapsUrl = safeHttpUrl(pro.google_maps_url)
  if (mapsUrl) {
    locationLines.push(`<a href="${escapeHtml(mapsUrl)}" style="color:#1A1A2E;">Googleマップで見る</a>`)
  }

  const contactLines: string[] = []
  const bookingUrl = safeHttpUrl(pro.booking_url)
  if (bookingUrl) {
    contactLines.push(`予約HP: <a href="${escapeHtml(bookingUrl)}" style="color:#1A1A2E;">${escapeHtml(bookingUrl)}</a>`)
  }
  const websiteUrl = safeHttpUrl(pro.website_url)
  if (websiteUrl) {
    contactLines.push(`Webサイト: <a href="${escapeHtml(websiteUrl)}" style="color:#1A1A2E;">${escapeHtml(websiteUrl)}</a>`)
  }
  if (pro.phone_number) contactLines.push(`電話番号: ${escapeHtml(pro.phone_number)}`)
  if (pro.contact_email) contactLines.push(`メール: ${escapeHtml(pro.contact_email)}`)

  let html = ''
  if (locationLines.length > 0) {
    html += `<br><br><strong style="color:#333;">当日のご案内</strong><br>${locationLines.join('<br>')}`
  } else {
    // レビュー重大1: 連絡先だけあるプロ(オンライン/訪問系)でも場所の案内が欠けることを明示する
    html += `<br><br>当日の場所は担当の先生からご連絡があります。`
  }
  if (contactLines.length > 0) {
    html += `<br><br><strong style="color:#333;">ご連絡先</strong><br>${contactLines.join('<br>')}`
  } else if (locationLines.length === 0) {
    html = `<br><br>当日の場所・ご連絡方法は担当の先生からご連絡があります。`
  }
  return html
}

function emailShell(title: string, bodyHtml: string, ctaText?: string, ctaUrl?: string): string {
  return `
    <div style="max-width:480px;margin:0 auto;font-family:sans-serif;">
      <div style="background:#1A1A2E;padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:#C4A35A;font-size:14px;margin:0;">REAL PROOF</h1>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #eee;">
        <p style="color:#333;font-size:15px;font-weight:bold;">
          ${title}
        </p>
        <p style="color:#333;font-size:14px;line-height:1.7;">
          ${bodyHtml}
        </p>
        ${
          ctaUrl
            ? `<div style="text-align:center;margin:24px 0;">
                <a href="${ctaUrl}"
                   style="display:inline-block;background:#1A1A2E;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:14px;">
                  ${ctaText || ''}
                </a>
              </div>`
            : ''
        }
      </div>
      <div style="padding:16px;text-align:center;background:#f9f9f9;border-radius:0 0 12px 12px;">
        <p style="color:#999;font-size:11px;margin:0;">REAL PROOF — 強みで証明されたプロに出会う</p>
      </div>
    </div>
  `
}

/** プロ向け通知の共通送信ロジック(LINE優先→メールフォールバック)。 */
async function sendProNotification(
  target: ProNotifyTarget,
  params: { lineText: string; emailSubject: string; emailBodyHtml: string },
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  if (target.line_messaging_user_id) {
    const result = await sendLinePushText(target.line_messaging_user_id, params.lineText)
    if (result.success) return { sent: true, via: 'line' }
    // LINE送信失敗時はメールへフォールバック
  }

  if (target.contact_email) {
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return { sent: false, via: null }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'REAL PROOF <noreply@realproof.jp>',
          to: target.contact_email,
          subject: params.emailSubject,
          html: params.emailBodyHtml,
        }),
      })
      if (res.ok) return { sent: true, via: 'email' }
      // レビューFAIL修正(軽微6): Resendのエラーレスポンス本文にはto(宛先メール)が
      // 含まれうるためログに出さない。statusのみ記録する。
      console.error('[referral-notify] Resend error:', res.status)
      return { sent: false, via: null }
    } catch (err) {
      console.error('[referral-notify] Email send error:', err)
      return { sent: false, via: null }
    }
  }

  return { sent: false, via: null }
}

/**
 * §3-0改訂(先行テスト第3弾・CEO決定): 承諾ゲート撤廃により、これは「即時掲載済み」の
 * 事後通知になる（承諾・拒否の依頼ではない）。辞退したい場合はホーム画面の受付トグルをオフに
 * する旨を明示する。
 */
export async function notifyReferralPinAdded(
  target: ProNotifyTarget,
  senderProName: string,
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const dashboardUrl = `${APP_URL}/dashboard?tab=referral`
  const safeSenderProName = escapeHtml(senderProName)
  return sendProNotification(target, {
    lineText: `${senderProName}さんがあなたを紹介リストに追加しました。紹介されたくない場合は、ホーム画面の受付トグルをオフにしてください。\n${dashboardUrl}`,
    emailSubject: `${senderProName}さんが紹介リストに追加しました`,
    emailBodyHtml: emailShell(
      '紹介リスト掲載のお知らせ',
      `${safeSenderProName}さんが、あなたを紹介リストに追加しました。<br>紹介されたくない場合は、ホーム画面の受付トグルをオフにしてください。`,
      'ダッシュボードを開く',
      dashboardUrl,
    ),
  })
}

/**
 * §2-4: 予約リクエストが届いたことを受け手プロへ通知する。
 */
export async function notifyBookingRequested(
  target: ProNotifyTarget,
  clientNickname: string,
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const dashboardUrl = `${APP_URL}/dashboard?tab=referral`
  const safeClientNickname = escapeHtml(clientNickname)
  return sendProNotification(target, {
    lineText: `紹介予約のリクエストが届いています(${clientNickname}さん)。48時間以内にダッシュボードからご確認ください。\n${dashboardUrl}`,
    emailSubject: '紹介予約のリクエストが届いています',
    emailBodyHtml: emailShell(
      '紹介予約リクエストのお知らせ',
      `${safeClientNickname}さんから紹介予約のリクエストが届いています。<br><strong>48時間以内</strong>にダッシュボードからご確認ください。`,
      'ダッシュボードを開く',
      dashboardUrl,
    ),
  })
}

/**
 * §2-4/§4-8: 予約が確定した際、送り手プロへ「紹介が成立した」ことを通知する。
 * CEO決定(2026-08-04): 送り手宛の進捗通知にはリンクを付けない(操作不要な事後報告のため)。
 */
export async function notifyBookingConfirmedToSender(
  target: ProNotifyTarget,
  clientNickname: string,
  receiverProName: string,
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const safeClientNickname = escapeHtml(clientNickname)
  const safeReceiverProName = escapeHtml(receiverProName)
  // CEO指摘(2026-08-04): 送り手宛は「あなたが紹介した◯◯さん」と主語を明示しないと何の通知か分からない
  return sendProNotification(target, {
    lineText: `あなたが紹介した${clientNickname}さんの紹介予約が、${receiverProName}さんとの間で成立しました。`,
    emailSubject: 'あなたの紹介が成立しました',
    emailBodyHtml: emailShell(
      '紹介成立のお知らせ',
      `あなたが紹介した${safeClientNickname}さんの紹介予約が、${safeReceiverProName}さんとの間で確定しました。<br>あなたの紹介がつながりました。`,
    ),
  })
}

/**
 * §2-4ステージ3(予約フィー方式): クライアントの予約フィー支払いが完了し、予約が成立した際、
 * 受け手プロへ通知する(送り手プロへの成立通知は既存の notifyBookingConfirmedToSender を再利用する)。
 */
export async function notifyBookingPaymentCompletedToReceiver(
  target: ProNotifyTarget,
  clientNickname: string,
  /**
   * CEO決定(2026-08-04): 場所情報(住所/最寄駅/アクセスメモ/地図)が未設定のプロの場合のみ、
   * クライアントへの当日案内を別途連絡するよう促す(クライアント宛メールに場所が載らないため)。
   */
  opts?: { remindMissingLocationInfo?: boolean },
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const dashboardUrl = `${APP_URL}/dashboard?tab=referral`
  const safeClientNickname = escapeHtml(clientNickname)
  const reminder = opts?.remindMissingLocationInfo
    ? 'プロフィールに場所情報が未設定のため、クライアントへ当日の場所をお伝えください。'
    : ''
  // §2-4ステージ3(決済確認後の連絡先開示・CEO決定): 決済確認がとれたこの時点から
  // クライアントの連絡先(氏名・電話番号・メール)がダッシュボードで開示される。
  // ただしメール本文には電話番号等のPIIを直接書かない(メールは転送・誤送信リスクがあるため
  // 参照導線のみとする。実際の値はダッシュボードのAPI経由でのみ表示する)。
  return sendProNotification(target, {
    lineText: `${clientNickname}さんのお支払いが完了し、紹介予約が成立しました。クライアントの連絡先はダッシュボードでご確認ください。${reminder ? ' ' + reminder : ''}\n${dashboardUrl}`,
    emailSubject: 'お支払いが完了し、紹介予約が成立しました',
    emailBodyHtml: emailShell(
      '紹介予約成立のお知らせ',
      `${safeClientNickname}さんのお支払いが完了し、紹介予約が成立しました。<br>クライアントの連絡先はダッシュボードでご確認ください。${reminder ? `<br>${reminder}` : ''}`,
      'ダッシュボードを開く',
      dashboardUrl,
    ),
  })
}

/**
 * §2-4ステージ3(予約フィー方式): 確定後24時間以内に予約フィーの支払いが確認できず自動キャンセルに
 * なった際、受け手・送り手の両プロへ通知する(役割で文面を分けない汎用文言)。
 */
export async function notifyBookingPaymentExpiredToPro(
  target: ProNotifyTarget,
  clientNickname: string,
  /** CEO指摘(2026-08-04): 送り手宛は「あなたが紹介した◯◯さん」と主語を明示する(受け手と文面を分ける)。 */
  opts?: { forSender?: boolean },
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const safeClientNickname = escapeHtml(clientNickname)
  const subjectText = opts?.forSender
    ? `あなたが紹介した${clientNickname}さんの紹介予約は`
    : `${clientNickname}さんとの紹介予約は`
  const safeSubjectText = opts?.forSender
    ? `あなたが紹介した${safeClientNickname}さんの紹介予約は`
    : `${safeClientNickname}さんとの紹介予約は`
  return sendProNotification(target, {
    lineText: `${subjectText}、お支払いが確認できなかったため自動的にキャンセルされました。`,
    emailSubject: '紹介予約がキャンセルされました',
    emailBodyHtml: emailShell(
      '紹介予約キャンセルのお知らせ',
      `${safeSubjectText}、お支払いが確認できなかったため自動的にキャンセルされました。`,
    ),
  })
}

/**
 * §2-4: 48時間自動失効時、送り手プロへ通知する。
 */
export async function notifyBookingExpiredToSender(
  target: ProNotifyTarget,
  clientNickname: string,
  receiverProName: string,
  listUrl: string,
  /**
   * レビューFAIL修正(中2): counter_slots(逆指定の提案)が有る状態で失効した場合、
   * 「受け手が確定しなかった」ではなく「クライアントが返答しなかった」が真因のため文言を分岐する。
   */
  opts?: { hadCounterProposal?: boolean },
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const safeClientNickname = escapeHtml(clientNickname)
  const safeReceiverProName = escapeHtml(receiverProName)
  // CEO決定(2026-08-04): 送り手宛の進捗通知にはリンクを付けない(listUrl引数は互換のため残置)
  void listUrl
  const bodyHtml = opts?.hadCounterProposal
    ? `あなたが紹介した${safeClientNickname}さんから提案日時への返答が48時間以内になく、${safeReceiverProName}さんへの紹介予約のリクエストは失効しました。<br>別の候補もご紹介いただけます。`
    : `あなたが紹介した${safeClientNickname}さんの${safeReceiverProName}さんへの紹介予約のリクエストは、48時間以内に確定のご連絡がなかったため失効しました。<br>別の候補もご紹介いただけます。`
  const lineText = opts?.hadCounterProposal
    ? `あなたが紹介した${clientNickname}さんから提案日時への返答がなく、${receiverProName}さんへの紹介予約のリクエストは48時間で失効しました。`
    : `あなたが紹介した${clientNickname}さんの${receiverProName}さんへの紹介予約のリクエストが、48時間以内に確定されなかったため失効しました。`
  return sendProNotification(target, {
    lineText,
    emailSubject: '紹介予約のリクエストが失効しました',
    emailBodyHtml: emailShell('紹介予約リクエスト失効のお知らせ', bodyHtml),
  })
}

/**
 * クライアントへメール通知する(§2-4/§2-4ステージ1)。
 * 優先順位: `target.email`(referral_bookings.client_email。アカウントレス予約由来)が
 * あればそれを使い、無ければ `target.userId` から Clerk Backend API で都度取得する
 * (メールはDBに保存せず都度取得する旧仕様。旧予約=client_email無しのフォールバック)。
 */
export async function notifyClientByEmail(
  target: { userId?: string | null; email?: string | null },
  subject: string,
  bodyHtml: string,
): Promise<{ sent: boolean }> {
  let email = target.email || null

  if (!email && target.userId) {
    try {
      const clerk = await clerkClient()
      const user = await clerk.users.getUser(target.userId)
      email = user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || null
    } catch (err) {
      console.error('[referral-notify] notifyClientByEmail clerk lookup error:', err)
    }
  }

  if (!email) return { sent: false }

  try {
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return { sent: false }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'REAL PROOF <noreply@realproof.jp>',
        to: email,
        subject,
        html: bodyHtml,
      }),
    })
    if (!res.ok) {
      // レビューFAIL修正(軽微6): Resendのエラーレスポンス本文には
      // クライアントのメールアドレスが含まれうるためログに出さない。statusのみ記録する。
      console.error('[referral-notify] notifyClientByEmail Resend error:', res.status)
      return { sent: false }
    }
    return { sent: true }
  } catch (err) {
    console.error('[referral-notify] notifyClientByEmail error:', err)
    return { sent: false }
  }
}

/**
 * §2-10: 案件スレッドに新しいコメントが届いたことを相手側プロへ通知する。
 * PII/傷病名保護のため本文(body)はLINE/メールに一切含めない。
 */
export async function notifyBookingMessage(
  target: ProNotifyTarget,
  senderProName: string,
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  // CEO決定(2026-08-04): リンクは付けない(ダッシュボードの紹介タブに行くだけのため文言で案内)
  const safeSenderProName = escapeHtml(senderProName)
  return sendProNotification(target, {
    lineText: `${senderProName}さんから案件スレッドに新しいコメントがあります。ダッシュボードの紹介タブからご確認ください。`,
    emailSubject: '案件スレッドに新しいコメントがあります',
    emailBodyHtml: emailShell(
      '案件スレッドのお知らせ',
      `${safeSenderProName}さんから案件スレッドに新しいコメントが届いています。<br>ダッシュボードの紹介タブからご確認ください。`,
    ),
  })
}

/**
 * 全クライアント向けメールの末尾に紹介リストへの導線を追加する共通スニペット
 * (ライフサイクル改善・CEO決定2026-08-04: 確定/決済案内・辞退・counter・失効・未払いキャンセルの
 * 各メールに紹介リストリンクを常設する)。CTAボタン枠が別用途で埋まっているメールでは
 * bodyHtmlの末尾に追記して使う。
 */
export function referralListFooterHtml(listUrl: string, label = '紹介リストに戻る'): string {
  return `<br><br><a href="${listUrl}" style="color:#888888;font-size:12px;text-decoration:underline;">${label} →</a>`
}

/**
 * ライフサイクル改善(タスクD): 受け手が辞退した際、送り手プロへ通知する。
 */
export async function notifyBookingDeclinedToSender(
  target: ProNotifyTarget,
  receiverProName: string,
  clientNickname: string,
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  // CEO決定(2026-08-04): 送り手宛の進捗通知にはリンクを付けない・「あなたが紹介した◯◯さん」と主語を明示
  const safeReceiverProName = escapeHtml(receiverProName)
  const safeClientNickname = escapeHtml(clientNickname)
  return sendProNotification(target, {
    lineText: `あなたが紹介した${clientNickname}さんのご相談を、${receiverProName}さんが辞退しました。`,
    emailSubject: `ご紹介先の${receiverProName}さんが辞退しました`,
    emailBodyHtml: emailShell(
      '辞退のお知らせ',
      `あなたが紹介した${safeClientNickname}さんのご相談を、${safeReceiverProName}さんが辞退しました。`,
    ),
  })
}

/**
 * ライフサイクル改善(タスクA/D・逆指定): 受け手が別日時を提案した際、送り手プロへ通知する。
 */
export async function notifyBookingCounterProposedToSender(
  target: ProNotifyTarget,
  receiverProName: string,
  clientNickname: string,
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  // CEO決定(2026-08-04): 送り手宛の進捗通知にはリンクを付けない・「あなたが紹介した◯◯さん」と主語を明示
  const safeReceiverProName = escapeHtml(receiverProName)
  const safeClientNickname = escapeHtml(clientNickname)
  return sendProNotification(target, {
    lineText: `あなたが紹介した${clientNickname}さんへ、${receiverProName}さんが別の日時を提案しました(${clientNickname}さんの返答待ち)。`,
    emailSubject: `ご紹介先の${receiverProName}さんが別日時を提案しました`,
    emailBodyHtml: emailShell(
      '別日時提案のお知らせ',
      `あなたが紹介した${safeClientNickname}さんへ、${safeReceiverProName}さんが別の日時を提案しました。<br>${safeClientNickname}さんの返答待ちです。`,
    ),
  })
}

/**
 * ライフサイクル改善(タスクD): 紹介セッション完了時、送り手プロへ通知する。
 */
export async function notifyBookingCompletedToSender(
  target: ProNotifyTarget,
  clientNickname: string,
  receiverProName: string,
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  // CEO決定(2026-08-04): 送り手宛の進捗通知にはリンクを付けない・「あなたが紹介した◯◯さん」と主語を明示
  // (旧文言「◯◯さんとのセッションが完了しました」は送り手自身のセッションに読めた)
  const safeClientNickname = escapeHtml(clientNickname)
  const safeReceiverProName = escapeHtml(receiverProName)
  return sendProNotification(target, {
    lineText: `あなたが紹介した${clientNickname}さんと${receiverProName}さんのセッションが完了しました。`,
    emailSubject: `あなたが紹介した${clientNickname}さんのセッションが完了しました`,
    emailBodyHtml: emailShell(
      'セッション完了のお知らせ',
      `あなたが紹介した${safeClientNickname}さんと${safeReceiverProName}さんのセッションが完了しました。`,
    ),
  })
}

/**
 * タスク②(2026-08-04・CEO指示): プロ都合/クライアント都合キャンセル＋自動返金。確定済み予約が
 * キャンセルされた際、送り手プロへ通知する(進捗通知にはリンクを付けない・主語を明示する既存方針を踏襲)。
 * CEO決定(2026-08-04・追加): reasonでプロ都合/クライアント都合の文言を分岐する。
 */
export async function notifyBookingCancelledByReceiverToSender(
  target: ProNotifyTarget,
  receiverProName: string,
  clientNickname: string,
  reason: 'pro' | 'client' = 'pro',
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const safeClientNickname = escapeHtml(clientNickname)
  const safeReceiverProName = escapeHtml(receiverProName)
  const reasonText = reason === 'client' ? 'クライアントのご希望により' : `${receiverProName}さん(受け手)の都合により`
  const safeReasonText = reason === 'client' ? 'クライアントのご希望により' : `${safeReceiverProName}さん(受け手)の都合により`
  return sendProNotification(target, {
    lineText: `あなたが紹介した${clientNickname}さんの紹介予約は、${reasonText}キャンセルされました。`,
    emailSubject: `あなたが紹介した${clientNickname}さんの紹介予約がキャンセルされました`,
    emailBodyHtml: emailShell(
      '紹介予約キャンセルのお知らせ',
      `あなたが紹介した${safeClientNickname}さんの紹介予約は、${safeReasonText}キャンセルされました。`,
    ),
  })
}

/**
 * タスク②(2026-08-04・CEO指示): 確定済み予約がキャンセルされた際、クライアントへ通知する。
 * 返金有無で文言を分岐する(refundedAmountJpy: 返金対象額。null/0=返金なし/対象外)。
 * 返金は「手続きを行った」旨のみ伝える(カード会社の反映まで数日かかるため断言しすぎない)。
 * レビュー指摘(重大2): 事前告知で全額返金を約束済みのため、paid×返金失敗(refundPending)の場合は
 * 必ず「担当より別途ご連絡」の一文を入れる(返金の記述が一切出ない状態を防ぐ)。
 * レビュー指摘(軽微7): refundedAmountJpyは`!== null`ではなく`> 0`で判定する(¥0の「全額返金」表示を防ぐ)。
 * CEO決定(2026-08-04・追加): reason='client'の場合、リード文を「ご希望によるキャンセルを承りました。」に
 * 変更し、noRefundByPolicy(セッション開始72時間前ルールによる「返金なし」・システム障害ではない)を
 * 専用文言で案内する(refundPendingの「担当より別途ご連絡」とは意味が違うため混同しない)。
 * レビュー指摘(軽微8): 返金額表示の2分岐(pro/client)はpaidPrefixのみの差のため1本化する。
 * レビュー指摘(軽微9): reason='client'の場合、どの予約のキャンセルか特定できるよう
 * 「{受け手プロ名}さんとのご予約({確定日時})」を明記する(confirmedSlotTextは呼び出し元で解決済みの
 * ものを渡す・本関数では再解決しない)。noRefundByPolicy時は問い合わせ先の一文を追加する
 * (Resendのreply-to設定が無いため、返信誘導ではなくinfo@proof-app.jp宛の案内にする)。
 */
export async function notifyBookingCancelledByReceiverToClient(
  target: { userId?: string | null; email?: string | null },
  receiverProName: string,
  listUrl: string,
  opts: {
    reason?: 'pro' | 'client'
    refundedAmountJpy: number | null
    refundPending: boolean
    noRefundByPolicy?: boolean
    confirmedSlotText?: string | null
  },
): Promise<{ sent: boolean }> {
  const safeReceiverProName = escapeHtml(receiverProName)
  const reason = opts.reason || 'pro'
  const safeConfirmedSlotText = opts.confirmedSlotText ? escapeHtml(opts.confirmedSlotText) : null
  const leadHtml =
    reason === 'client'
      ? safeConfirmedSlotText
        ? `${safeReceiverProName}さんとのご予約(${safeConfirmedSlotText})について、ご希望によるキャンセルを承りました。`
        : `${safeReceiverProName}さんとのご予約について、ご希望によるキャンセルを承りました。`
      : `${safeReceiverProName}さんの都合により、紹介予約はキャンセルされました。`

  let refundPart = ''
  if (opts.refundPending) {
    refundPart = '<br><br>ご返金の手続きについては、担当より別途ご連絡いたします(数日以内)。'
  } else if (opts.refundedAmountJpy !== null && opts.refundedAmountJpy > 0) {
    const paidPrefix = reason === 'client' ? '' : 'お支払いいただいた'
    refundPart = `<br><br>${paidPrefix}予約金(¥${opts.refundedAmountJpy.toLocaleString()})は全額返金の手続きを行いました。カード会社により反映まで数日かかる場合があります。`
  } else if (reason === 'client' && opts.noRefundByPolicy) {
    refundPart =
      '<br><br>セッション開始の72時間前を過ぎていたため、予約金の返金はございません(ご案内済みのキャンセルポリシーに基づきます)。' +
      '<br>ご希望と異なる場合はお手数ですが info@proof-app.jp までご連絡ください。'
  }

  return notifyClientByEmail(
    target,
    reason === 'client' ? 'ご希望によるキャンセルを承りました' : `${receiverProName}さんの都合により紹介予約がキャンセルされました`,
    emailShell(
      '紹介予約キャンセルのお知らせ',
      `${leadHtml}${refundPart}` + referralListFooterHtml(listUrl, '他の先生もご紹介できます'),
    ),
  )
}

/**
 * ライフサイクル改善(タスクB・レビューFAIL修正・重大1): クライアントが逆指定の提案日時の中から
 * 1つを選択した際、受け手プロへ必ず通知する(決済対象/対象外に関わらず。確定した日時が
 * 受け手に届かないと現場で確認しようがないため)。決済対象で支払い待ちの場合は
 * awaitingPaymentで文言を分岐する(まだ「成立」ではなく「日時が選ばれた」段階であることを明示)。
 */
export async function notifyCounterAcceptedToReceiver(
  target: ProNotifyTarget,
  clientNickname: string,
  confirmedSlotText: string | null,
  opts?: { awaitingPayment?: boolean },
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const dashboardUrl = `${APP_URL}/dashboard?tab=referral`
  const safeClientNickname = escapeHtml(clientNickname)
  const slotPart = confirmedSlotText ? `${confirmedSlotText} で確定` : '日時を選択'
  const paymentNote = opts?.awaitingPayment
    ? 'クライアントのお支払い完了で紹介予約成立となります。'
    : ''
  return sendProNotification(target, {
    lineText: `${clientNickname}さんが日時を選択しました(${slotPart})。${paymentNote}\n${dashboardUrl}`,
    emailSubject: 'クライアントが日時を選択しました',
    emailBodyHtml: emailShell(
      '日程確定のお知らせ',
      `${safeClientNickname}さんが日時を選択しました(${slotPart})。${paymentNote ? `<br>${paymentNote}` : ''}`,
      'ダッシュボードを開く',
      dashboardUrl,
    ),
  })
}

/**
 * ライフサイクル改善(タスクA): 受け手が別日時を提案した際、クライアントへ通知する。
 * 提案日時は曜日付き整形済みテキストの配列で受け取る(サーバー側でformatSlotWithWeekdayを適用)。
 */
export async function notifyCounterProposedToClient(
  target: { userId?: string | null; email?: string | null },
  receiverProName: string,
  slotTexts: string[],
  bookingUrl: string,
  listUrl: string,
): Promise<{ sent: boolean }> {
  const safeReceiverProName = escapeHtml(receiverProName)
  const slotListHtml = slotTexts.map((t) => `<li>${escapeHtml(t)}</li>`).join('')
  return notifyClientByEmail(
    target,
    `${receiverProName}さんから別日時のご提案があります`,
    emailShell(
      '別日時のご提案',
      `ご希望の日時では難しいため、${safeReceiverProName}さんから別の日時のご提案があります。` +
        `<ul style="padding-left:18px;margin:12px 0;">${slotListHtml}</ul>` +
        `<strong>48時間以内</strong>にご返答がない場合は無効になります。` +
        referralListFooterHtml(listUrl),
      'ご希望の日時を選ぶ',
      bookingUrl,
    ),
  )
}

/**
 * ライフサイクル改善(タスクC): 相談リクエスト送信直後、クライアントへ受付メールを送る。
 * 決済フロー対象かどうかで②③のステップ文言を分岐する(paymentFlowActive)。
 */
export async function notifyBookingReceivedToClient(
  target: { userId?: string | null; email?: string | null },
  receiverProName: string,
  listUrl: string,
  opts: { paymentFlowActive: boolean },
): Promise<{ sent: boolean }> {
  const safeReceiverProName = escapeHtml(receiverProName)
  const step2 = opts.paymentFlowActive
    ? '②確定すると、メールでお知らせします(予約金のお支払いご案内も届きます)'
    : '②確定次第、メールでお知らせします'
  const step3 = opts.paymentFlowActive
    ? '③お支払いが完了すると紹介予約が成立します(総額は変わりません。当日は残額のみ。プロの都合でキャンセルとなった場合は予約金が全額返金されます。クライアント様のご都合によるキャンセルは、セッション開始の72時間前まで全額返金・それ以降は返金いたしかねます)'
    : '③確定のご連絡をお待ちください'
  return notifyClientByEmail(
    target,
    `${receiverProName}さんへのリクエストを受け付けました`,
    emailShell(
      'リクエスト受付のお知らせ',
      `${safeReceiverProName}さんへのご相談リクエストを受け付けました。<br><br>` +
        `<strong>今後の流れ</strong><br>` +
        `①48時間以内に${safeReceiverProName}さんが日時を確定します(別日時のご提案の場合もあります)<br>` +
        `${step2}<br>` +
        `${step3}<br>` +
        `④当日セッション<br>` +
        `⑤完了` +
        referralListFooterHtml(listUrl),
    ),
  )
}

/**
 * ライフサイクル改善(タスクC・2026-08-04・CEO指示): 成立メールの末尾に添えるGoogleカレンダー
 * 追加リンクHTML。calendarUrlがnull(確定日時が解決できない等)の場合は空文字を返す。
 */
export function buildCalendarLinkHtml(calendarUrl: string | null): string {
  if (!calendarUrl) return ''
  // レビュー指摘(軽微3): hrefに生のcalendarUrlを渡すと`&`が未エスケープのまま出力される(Google
  // カレンダーURLはクエリを複数`&`連結するため実害あり)。escapeHtml()を通す。
  return `<br><br><a href="${escapeHtml(calendarUrl)}" style="color:#1A1A2E;">Googleカレンダーに追加</a>`
}

/**
 * 連絡先(booking_url/website_url/phone_number/contact_email)が1件でも設定済みか。
 * レビュー指摘(軽微8): 「上記のご連絡先へ直接ご連絡ください」は、連絡先が実際に本文へ
 * 載っている場合のみ意味を持つ文言のため、1件も無い場合は付与しない。
 */
export function hasProContactInfo(pro: {
  booking_url: string | null
  website_url: string | null
  phone_number: string | null
  contact_email: string | null
}): boolean {
  return !!(pro.booking_url || pro.website_url || pro.phone_number || pro.contact_email)
}

/**
 * ライフサイクル改善(タスクC・2026-08-04・CEO指示): 成立メールに追加する一文
 * (クライアント側の日時変更希望は、プロへ直接連絡してもらう運用のため)。
 * レビュー指摘(軽微8): プロの連絡先が1件も無い場合は「上記のご連絡先へ」という文言自体が
 * 成立しないため付与しない。
 */
export function buildRescheduleContactNoteHtml(pro: {
  booking_url: string | null
  website_url: string | null
  phone_number: string | null
  contact_email: string | null
}): string {
  if (!hasProContactInfo(pro)) return ''
  return '<br><br>日時のご変更をご希望の場合は、上記のご連絡先へ直接ご連絡ください。'
}

/**
 * CEO指摘(2026-08-04・意味合い変更): 「プロの中立的な提案」から「プロがどうしても確定日時に
 * 都合がつかなくなったための変更のお願い」へ全面変更。「ご都合が合わない場合はそのまま現在の
 * 日時で実施されます」はプロが来られない前提と矛盾するため削除し、代わりに「予約成立時のメールの
 * 連絡先へ直接ご相談ください」の案内に置き換える。
 */
export async function notifyRescheduleProposedToClient(
  target: { userId?: string | null; email?: string | null },
  receiverProName: string,
  slotTexts: string[],
  currentSlotText: string | null,
  bookingUrl: string,
  listUrl: string,
): Promise<{ sent: boolean }> {
  const safeReceiverProName = escapeHtml(receiverProName)
  const slotListHtml = slotTexts.map((t) => `<li>${escapeHtml(t)}</li>`).join('')
  const currentPart = currentSlotText ? `(変更前: ${escapeHtml(currentSlotText)})` : ''
  return notifyClientByEmail(
    target,
    `${receiverProName}さんから日時変更のお願い`,
    emailShell(
      '日時変更のお願い',
      `${safeReceiverProName}さんの都合により、確定済みの日時${currentPart}でのご対応が難しくなりました。大変申し訳ありませんが、以下の候補から新しい日時をお選びください。` +
        `<ul style="padding-left:18px;margin:12px 0;">${slotListHtml}</ul>` +
        `いずれの日時もご都合が合わない場合は、予約成立時のメールに記載のご連絡先へ直接ご相談ください。` +
        referralListFooterHtml(listUrl),
      '新しい日時を選ぶ',
      bookingUrl,
    ),
  )
}

/**
 * タスクB: クライアントが日時変更のお願いから1つを選んだ際、受け手プロへ通知する。
 * CEO指摘(2026-08-04・意味合い変更): 「提案」→「お願い」の用語統一(必要最小限の調整)。
 */
export async function notifyRescheduleConfirmedToReceiver(
  target: ProNotifyTarget,
  clientNickname: string,
  newSlotText: string | null,
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const dashboardUrl = `${APP_URL}/dashboard?tab=referral`
  const safeClientNickname = escapeHtml(clientNickname)
  const slotPart = newSlotText ? `${newSlotText} に変更` : '新しい日時に変更'
  return sendProNotification(target, {
    lineText: `${clientNickname}さんが日時変更のお願いから新しい日時を選びました(${slotPart})。\n${dashboardUrl}`,
    emailSubject: '日時変更が確定しました',
    emailBodyHtml: emailShell(
      '日時変更確定のお知らせ',
      `${safeClientNickname}さんが新しい日時を選びました(${slotPart})。`,
      'ダッシュボードを開く',
      dashboardUrl,
    ),
  })
}

/**
 * タスクB: 受け手が提案した日時変更をクライアントが承諾した際、送り手プロへ通知する。
 * CEO決定(2026-08-04): 送り手宛の進捗通知にはリンクを付けない・「あなたが紹介した◯◯さん」と主語を明示。
 */
export async function notifyRescheduleConfirmedToSender(
  target: ProNotifyTarget,
  clientNickname: string,
  newSlotText: string | null,
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const safeClientNickname = escapeHtml(clientNickname)
  const slotPart = newSlotText ? `(新日時: ${newSlotText})` : ''
  return sendProNotification(target, {
    lineText: `あなたが紹介した${clientNickname}さんの紹介予約の日時が変更になりました${slotPart}`,
    emailSubject: 'あなたの紹介予約の日時が変更になりました',
    emailBodyHtml: emailShell(
      '日時変更のお知らせ',
      `あなたが紹介した${safeClientNickname}さんの紹介予約の日時が変更になりました。${newSlotText ? `<br>新日時: ${escapeHtml(newSlotText)}` : ''}`,
    ),
  })
}

/**
 * タスクB(2026-08-04・CEO指示・意味合い変更): クライアントが「候補では難しいため現在の日時を
 * 希望する」を選んだ際、受け手プロへ通知する。どうしても都合がつかない場合の代替導線として、
 * ダッシュボードからのキャンセル(予約金は全額返金)を案内する。
 */
export async function notifyRescheduleKeptCurrentToReceiver(
  target: ProNotifyTarget,
  clientNickname: string,
  currentSlotText: string | null = null,
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const dashboardUrl = `${APP_URL}/dashboard?tab=referral`
  const safeClientNickname = escapeHtml(clientNickname)
  const slotPart = currentSlotText ? `(${currentSlotText})` : ''
  const safeSlotPart = currentSlotText ? `(${escapeHtml(currentSlotText)})` : ''
  return sendProNotification(target, {
    lineText: `${clientNickname}さんは現在の日時${slotPart}を希望しています。どうしてもご都合がつかない場合は、ダッシュボードからキャンセル(予約金は全額返金されます)をご検討ください。\n${dashboardUrl}`,
    emailSubject: 'クライアントは現在の日時を希望しています',
    emailBodyHtml: emailShell(
      '日時変更のお知らせ',
      `${safeClientNickname}さんは現在の日時${safeSlotPart}を希望しています。<br>どうしてもご都合がつかない場合は、ダッシュボードからキャンセル(予約金は全額返金されます)をご検討ください。`,
      'ダッシュボードを開く',
      dashboardUrl,
    ),
  })
}

/** タスクB/C: 日時変更の提案からクライアントが新しい日時を選んだ際、クライアント自身への確認メール。 */
export async function notifyRescheduleConfirmedToClient(
  target: { userId?: string | null; email?: string | null },
  receiverProName: string,
  newSlotText: string | null,
  listUrl: string,
  calendarUrl: string | null,
): Promise<{ sent: boolean }> {
  const safeReceiverProName = escapeHtml(receiverProName)
  return notifyClientByEmail(
    target,
    '日時変更が確定しました',
    emailShell(
      '日時変更確定のお知らせ',
      `${safeReceiverProName}さんとのご相談日時が変更になりました。${newSlotText ? `<br>新日時: ${escapeHtml(newSlotText)}` : ''}` +
        buildCalendarLinkHtml(calendarUrl) +
        referralListFooterHtml(listUrl),
    ),
  )
}

/**
 * ライフサイクル改善(タスクA・2026-08-04・CEO指示): 受け手が当日の場所を送信した際、
 * クライアントへ通知する(担当プロ名+場所テキストのみ。改行は<br>に変換)。
 */
export async function notifyLocationToClient(
  target: { userId?: string | null; email?: string | null },
  receiverProName: string,
  locationText: string,
): Promise<{ sent: boolean }> {
  const safeReceiverProName = escapeHtml(receiverProName)
  const safeLocationText = escapeHtml(locationText).replace(/\n/g, '<br>')
  return notifyClientByEmail(
    target,
    '当日の場所のご案内',
    emailShell(
      '当日の場所のご案内',
      `${safeReceiverProName}さんから、当日の場所のご案内です。<br><br>${safeLocationText}`,
    ),
  )
}

/**
 * §2-9: 招待経由でRP未登録のプロが登録を完了したことを、招待した側のプロへ通知する。
 */
export async function notifyInviteRegistered(
  target: ProNotifyTarget,
  registeredProName: string,
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  // CEO決定(2026-08-04): 送り手宛の進捗通知にはリンクを付けない
  const safeRegisteredProName = escapeHtml(registeredProName)
  return sendProNotification(target, {
    lineText: `${registeredProName}さんが招待から登録を完了しました。`,
    emailSubject: `${registeredProName}さんが登録を完了しました`,
    emailBodyHtml: emailShell(
      '招待登録完了のお知らせ',
      `${safeRegisteredProName}さんが、あなたの招待からREAL PROOFへの登録を完了しました。`,
    ),
  })
}

export { emailShell }
