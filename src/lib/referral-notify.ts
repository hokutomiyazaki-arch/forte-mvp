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
    lineText: `紹介経由の予約リクエストが届いています(${clientNickname}さん)。48時間以内にダッシュボードからご確認ください。\n${dashboardUrl}`,
    emailSubject: '紹介経由の予約リクエストが届いています',
    emailBodyHtml: emailShell(
      '予約リクエストのお知らせ',
      `${safeClientNickname}さんから予約リクエストが届いています。<br><strong>48時間以内</strong>にダッシュボードからご確認ください。`,
      'ダッシュボードを開く',
      dashboardUrl,
    ),
  })
}

/**
 * §2-4/§4-8: 予約が確定した際、送り手プロへ「紹介が成立した」ことを通知する。
 */
export async function notifyBookingConfirmedToSender(
  target: ProNotifyTarget,
  clientNickname: string,
  receiverProName: string,
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const dashboardUrl = `${APP_URL}/dashboard?tab=referral`
  const safeClientNickname = escapeHtml(clientNickname)
  const safeReceiverProName = escapeHtml(receiverProName)
  return sendProNotification(target, {
    lineText: `あなたの紹介が成立しました(クライアント: ${clientNickname}さん・${receiverProName}さんが確定)。\n${dashboardUrl}`,
    emailSubject: 'あなたの紹介が成立しました',
    emailBodyHtml: emailShell(
      '紹介成立のお知らせ',
      `${safeClientNickname}さんの予約が、${safeReceiverProName}さんとの間で確定しました。<br>あなたの紹介がつながりました。`,
      'ダッシュボードを開く',
      dashboardUrl,
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
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const dashboardUrl = `${APP_URL}/dashboard?tab=referral`
  const safeClientNickname = escapeHtml(clientNickname)
  return sendProNotification(target, {
    lineText: `${clientNickname}さんのお支払いが完了し、予約が成立しました。\n${dashboardUrl}`,
    emailSubject: 'お支払いが完了し、予約が成立しました',
    emailBodyHtml: emailShell(
      '予約成立のお知らせ',
      `${safeClientNickname}さんのお支払いが完了し、予約が成立しました。<br>ダッシュボードからご確認ください。`,
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
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const safeClientNickname = escapeHtml(clientNickname)
  return sendProNotification(target, {
    lineText: `${clientNickname}さんとの予約は、お支払いが確認できなかったため自動的にキャンセルされました。`,
    emailSubject: '予約がキャンセルされました',
    emailBodyHtml: emailShell(
      '予約キャンセルのお知らせ',
      `${safeClientNickname}さんとの予約は、お支払いが確認できなかったため自動的にキャンセルされました。`,
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
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const safeClientNickname = escapeHtml(clientNickname)
  const safeReceiverProName = escapeHtml(receiverProName)
  return sendProNotification(target, {
    lineText: `${clientNickname}さんの${receiverProName}さんへの予約リクエストが、48時間以内に確定されなかったため失効しました。\n${listUrl}`,
    emailSubject: '予約リクエストが失効しました',
    emailBodyHtml: emailShell(
      '予約リクエスト失効のお知らせ',
      `${safeClientNickname}さんの${safeReceiverProName}さんへの予約リクエストは、48時間以内に確定のご連絡がなかったため失効しました。<br>別の候補もご紹介いただけます。`,
      'リストを見る',
      listUrl,
    ),
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
  const dashboardUrl = `${APP_URL}/dashboard?tab=referral`
  const safeSenderProName = escapeHtml(senderProName)
  return sendProNotification(target, {
    lineText: `${senderProName}さんから案件スレッドに新しいコメントがあります。\n${dashboardUrl}`,
    emailSubject: '案件スレッドに新しいコメントがあります',
    emailBodyHtml: emailShell(
      '案件スレッドのお知らせ',
      `${safeSenderProName}さんから案件スレッドに新しいコメントが届いています。<br>ダッシュボードからご確認ください。`,
      'ダッシュボードを開く',
      dashboardUrl,
    ),
  })
}

/**
 * §2-9: 招待経由でRP未登録のプロが登録を完了したことを、招待した側のプロへ通知する。
 */
export async function notifyInviteRegistered(
  target: ProNotifyTarget,
  registeredProName: string,
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const dashboardUrl = `${APP_URL}/dashboard?tab=referral`
  const safeRegisteredProName = escapeHtml(registeredProName)
  return sendProNotification(target, {
    lineText: `${registeredProName}さんが招待から登録を完了しました。\n${dashboardUrl}`,
    emailSubject: `${registeredProName}さんが登録を完了しました`,
    emailBodyHtml: emailShell(
      '招待登録完了のお知らせ',
      `${safeRegisteredProName}さんが、あなたの招待からREAL PROOFへの登録を完了しました。<br>ダッシュボードからリストの状態をご確認いただけます。`,
      'ダッシュボードを開く',
      dashboardUrl,
    ),
  })
}

export { emailShell }
