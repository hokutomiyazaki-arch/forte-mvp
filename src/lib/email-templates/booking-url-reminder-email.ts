/**
 * booking_url 未設定プロ向けの月次通知メール
 *
 * Phase 2: 累積票が 1 以上溜まっているのに booking_url が空のプロに対して、
 * 月 1 回 (cron は週次だが per-pro 30 日 cooldown) 設定促進メールを送る。
 *
 * デザイン方針:
 *   reward-email.ts (お礼メール = ダーク/ゴールドで celebratory) と差別化し、
 *   こちらは「業務連絡的な促進メール」のため light + 落ち着いたゴールド/紺で構成。
 *   インライン CSS、600px 幅、HTML/text 両方生成。
 *
 * リンク URL は dashboard?tab=profile&edit=true に UTM 付き。
 * 既存の useSearchParams 経由で setEditing(true) が発火する設計。
 */

import { escapeHtml, appendUtmParams } from './reward-email'

export interface BookingUrlReminderParams {
  proName: string
  voteCount: number
  recipientEmail: string
  proId: string
}

export interface BookingUrlReminderResult {
  subject: string
  html: string
  text: string
}

export function buildBookingUrlReminderEmail(
  p: BookingUrlReminderParams
): BookingUrlReminderResult {
  const { proName, voteCount, recipientEmail, proId } = p

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://realproof.jp'

  const editUrl = appendUtmParams(`${siteUrl}/dashboard?tab=profile&edit=true`, {
    utm_source: 'realproof',
    utm_medium: 'booking_reminder',
    utm_campaign: 'booking_url_setup',
    utm_content: proId,
  })

  // 配信停止リンク (Phase 2 では実機能なし、表示のみ — Phase 3 以降で対応予定)
  const unsubscribeUrl = `${siteUrl}/unsubscribe?type=booking_reminder&pro_id=${encodeURIComponent(proId)}&email=${encodeURIComponent(recipientEmail)}`

  const subject = `${proName}さん、応援してくれた${voteCount}人のお客さんを逃していませんか？`

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#FAFAF7;font-family:'Hiragino Sans','Noto Sans JP',sans-serif;color:#1A1A2E;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAFAF7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">

          <!-- ロゴ -->
          <tr>
            <td style="padding:0 0 24px;">
              <p style="margin:0;color:#C4A35A;font-size:13px;letter-spacing:2px;font-weight:600;">REALPROOF</p>
            </td>
          </tr>

          <!-- 挨拶 -->
          <tr>
            <td style="padding:0 0 16px;">
              <h1 style="margin:0;font-size:20px;color:#1A1A2E;font-weight:700;">${escapeHtml(proName)}さん、こんにちは</h1>
            </td>
          </tr>

          <!-- 本文 -->
          <tr>
            <td style="padding:0 0 16px;">
              <p style="margin:0;font-size:15px;line-height:1.8;color:#1A1A2E;">
                ${escapeHtml(proName)}さんのプロフィールでは、現在
                <strong style="color:#C4A35A;font-size:18px;">${voteCount}票</strong>
                のプルーフが集まっています。<br>本当にありがとうございます。
              </p>
            </td>
          </tr>

          <!-- 警告ボックス -->
          <tr>
            <td style="padding:8px 0 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #E5E5DA;border-radius:8px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#1A1A2E;">
                      ただ、${escapeHtml(proName)}さんのプロフィールには<br>
                      <strong>「予約・連絡先URL」</strong>が設定されていません。
                    </p>
                    <p style="margin:0;font-size:14px;line-height:1.7;color:#666;">
                      応援してくれたお客さんが「予約したい」「もっと話したい」と思った時、<br>
                      どこに連絡すればいいか伝わっていません。
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:32px 0 24px;">
              <a href="${escapeHtml(editUrl)}" style="display:inline-block;padding:14px 36px;background-color:#C4A35A;color:#1A1A2E;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">予約・連絡先URLを設定する →</a>
            </td>
          </tr>

          <!-- 例示ボックス -->
          <tr>
            <td style="padding:8px 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFDF;border-radius:8px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1A1A2E;">こんなURLが使えます</p>
                    <ul style="margin:0;padding-left:20px;font-size:13px;color:#1A1A2E;line-height:1.85;">
                      <li>公式LINEアカウントの追加URL (https://lin.ee/...)</li>
                      <li>予約サイト (Coubic、Reserva 等)</li>
                      <li>お問い合わせフォーム</li>
                      <li>自社ホームページ・Instagram</li>
                    </ul>
                    <p style="margin:12px 0 0;font-size:13px;color:#666;">なんでもOKです。</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- フッター -->
          <tr>
            <td style="padding:24px 0 0;border-top:1px solid #E5E5DA;">
              <p style="margin:0 0 6px;font-size:11px;color:#999;text-align:center;line-height:1.6;">このメールは REALPROOF からのお知らせです。<br>このメールへの返信はお受けできません。</p>
              <p style="margin:6px 0 0;text-align:center;">
                <a href="${escapeHtml(unsubscribeUrl)}" style="color:#999;font-size:11px;text-decoration:underline;">配信を停止する</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    `${proName}さん、こんにちは`,
    '',
    `${proName}さんのプロフィールでは、現在 ${voteCount}票 のプルーフが`,
    '集まっています。本当にありがとうございます。',
    '',
    `ただ、${proName}さんのプロフィールには「予約・連絡先URL」が`,
    '設定されていません。',
    '',
    '応援してくれたお客さんが「予約したい」「もっと話したい」と思った時、',
    'どこに連絡すればいいか伝わっていません。',
    '',
    '→ 予約・連絡先URLを設定する',
    editUrl,
    '',
    'こんなURLが使えます:',
    '- 公式LINEアカウントの追加URL (https://lin.ee/...)',
    '- 予約サイト (Coubic、Reserva 等)',
    '- お問い合わせフォーム',
    '- 自社ホームページ・Instagram',
    '',
    'なんでもOKです。',
    '',
    '──',
    'このメールは REALPROOF からのお知らせです。',
    'このメールへの返信はお受けできません。',
    '',
    `配信停止: ${unsubscribeUrl}`,
  ].join('\n')

  return { subject, html, text }
}
