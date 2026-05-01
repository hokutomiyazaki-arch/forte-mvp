/**
 * Phase 3 Step 2: Voice 返信通知メールテンプレート
 *
 * プロが Voicesタブでクライアントの声に返信を保存した直後に、
 * クライアントへ「返信が届きました」を Email で通知する。
 *
 * 設計方針:
 *   - 返信本文は **絶対に載せない** (サイト誘導が目的、SEO/再訪導線)
 *   - Phase 4 (past-vote-optin / reward-email) と表記・配色を統一
 *   - HTML / プレーンテキスト両方を生成
 *
 * displayName が null / 空白のみ の場合は「お客」に置換する (Phase 4 と同じ)。
 */

import { escapeHtml } from './reward-email'

const FALLBACK_NAME = 'お客'

function resolveDisplayName(displayName: string | null | undefined): string {
  if (displayName == null) return FALLBACK_NAME
  if (typeof displayName !== 'string') return FALLBACK_NAME
  if (displayName.trim() === '') return FALLBACK_NAME
  return displayName
}

export function generateSubject(professionalName: string): string {
  return `${professionalName}さんから、あなたの声に返信が届きました`
}

export function generateTextBody(params: {
  clientName: string | null
  professionalName: string
  deepLinkUrl: string
  unsubscribeUrl: string
}): string {
  const name = resolveDisplayName(params.clientName)

  return [
    `${name}様`,
    '',
    `${params.professionalName}さんが、あなたの声に返信しました。`,
    '',
    '▼ 返信を見る',
    params.deepLinkUrl,
    '',
    '──────────',
    '',
    'このメールは、REALPROOFの通知をご承認いただいた方にお送りしています。',
    `配信停止: ${params.unsubscribeUrl}`,
    '',
    'REALPROOF',
    '強みが、あなたを定義する。',
    'https://realproof.jp',
  ].join('\n')
}

export function generateHtmlBody(params: {
  clientName: string | null
  professionalName: string
  deepLinkUrl: string
  unsubscribeUrl: string
}): string {
  const name = resolveDisplayName(params.clientName)
  const subject = generateSubject(params.professionalName)

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#FAFAF7;font-family:'Hiragino Sans','Noto Sans JP',sans-serif;color:#1A1A2E;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAFAF7;padding:20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:8px;">
          <tr>
            <td style="padding:32px 28px;">

              <!-- テキストロゴ -->
              <div style="text-align:center;margin-bottom:24px;padding:8px 0;">
                <span style="font-size:26px;font-weight:bold;letter-spacing:3px;color:#1A1A2E;font-family:'Hiragino Sans','Noto Sans JP',sans-serif;">REALPROOF</span>
              </div>

              <!-- 宛名 -->
              <p style="margin:0 0 16px;font-size:15px;line-height:1.8;color:#1A1A2E;">
                ${escapeHtml(name)}様
              </p>

              <p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#1A1A2E;">
                ${escapeHtml(params.professionalName)}さんが、あなたの声に返信しました。
              </p>

              <!-- CTA: 返信を見るボタン -->
              <div style="text-align:center;margin:24px 0 32px;">
                <a href="${escapeHtml(params.deepLinkUrl)}" style="display:inline-block;background-color:#C4A35A;color:#FFFFFF;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">返信を見る</a>
              </div>

              <hr style="border:0;border-top:1px solid #E5E5E5;margin:24px 0;">

              <!-- フッター -->
              <p style="margin:0 0 8px;font-size:12px;line-height:1.7;color:#666;">
                このメールは、REALPROOFの通知をご承認いただいた方にお送りしています。
              </p>
              <p style="margin:0 0 16px;font-size:12px;line-height:1.7;color:#666;">
                配信停止: <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#666;text-decoration:underline;">こちら</a>
              </p>

              <p style="margin:24px 0 0;text-align:center;font-style:italic;color:#999;font-size:14px;line-height:1.6;">
                REALPROOF<br>
                強みが、あなたを定義する。<br>
                <a href="https://realproof.jp" style="color:#999;text-decoration:underline;">https://realproof.jp</a>
              </p>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
