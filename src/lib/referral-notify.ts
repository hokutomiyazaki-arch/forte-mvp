/**
 * 処方箋リストへのピン指名通知（§3-1 第2層・掲載通知＋拒否権）
 *
 * 対象プロへ「◯◯さんがあなたを紹介リストに掲載しようとしています」を通知する。
 * LINE push（line_messaging_user_id あり）優先 → なければ contact_email へ Resend → 両方無ければスキップ。
 * 通知の成否はピン追加処理の成否に影響させない（呼び出し側で try/catch する前提）。
 *
 * PII注意: 通知文面に normalized_email 等は含めない。
 */

import { sendLinePushText } from '@/lib/line-push'

const APP_URL = 'https://realproof.jp'

interface NotifyTarget {
  name: string
  contact_email: string | null
  line_messaging_user_id: string | null
}

export async function notifyReferralPinAdded(
  target: NotifyTarget,
  senderProName: string,
): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const dashboardUrl = `${APP_URL}/dashboard?tab=referral`
  const text = `${senderProName}さんがあなたを紹介リストに掲載しようとしています。ダッシュボードから承諾・拒否できます。\n${dashboardUrl}`

  if (target.line_messaging_user_id) {
    const result = await sendLinePushText(target.line_messaging_user_id, text)
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
          subject: `${senderProName}さんからの紹介リスト掲載のお知らせ`,
          html: `
            <div style="max-width:480px;margin:0 auto;font-family:sans-serif;">
              <div style="background:#1A1A2E;padding:24px;border-radius:12px 12px 0 0;">
                <h1 style="color:#C4A35A;font-size:14px;margin:0;">REAL PROOF</h1>
              </div>
              <div style="padding:24px;background:#fff;border:1px solid #eee;">
                <p style="color:#333;font-size:15px;font-weight:bold;">
                  紹介リスト掲載のお知らせ
                </p>
                <p style="color:#333;font-size:14px;line-height:1.7;">
                  ${senderProName}さんが、あなたを紹介リストに掲載しようとしています。<br>
                  ダッシュボードから承諾・拒否を選べます。
                </p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${dashboardUrl}"
                     style="display:inline-block;background:#1A1A2E;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:14px;">
                    ダッシュボードを開く
                  </a>
                </div>
              </div>
              <div style="padding:16px;text-align:center;background:#f9f9f9;border-radius:0 0 12px 12px;">
                <p style="color:#999;font-size:11px;margin:0;">REAL PROOF — 強みで証明されたプロに出会う</p>
              </div>
            </div>
          `,
        }),
      })
      if (res.ok) return { sent: true, via: 'email' }
      const errBody = await res.text()
      console.error('[referral-notify] Resend error:', res.status, errBody)
      return { sent: false, via: null }
    } catch (err) {
      console.error('[referral-notify] Email send error:', err)
      return { sent: false, via: null }
    }
  }

  return { sent: false, via: null }
}
