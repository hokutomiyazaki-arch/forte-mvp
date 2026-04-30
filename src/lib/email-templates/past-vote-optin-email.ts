/**
 * Phase 4: 過去票オプトイン配信メールテンプレート
 *
 * 過去にREALPROOFで投票したユーザーに対し、お知らせ配信の承認(オプトイン)を
 * 1度だけ依頼するメール。承認は1クリックで完了。
 *
 * - generateSubject():    件名 (固定文言)
 * - generateTextBody():   テキスト版本文
 * - generateHtmlBody():   HTML版本文 (REALPROOF Gold ボタン、LINE緑ボタン、レスポンシブ)
 *
 * displayName が null / undefined / 空文字 / 空白のみ の場合は「お客」に置換する。
 * optinUrl はそのまま埋め込む(呼び出し側で適切にエンコード済の前提)。
 */

import { escapeHtml } from './reward-email'

const FALLBACK_NAME = 'お客'

function resolveDisplayName(displayName: string | null | undefined): string {
  if (displayName == null) return FALLBACK_NAME
  if (typeof displayName !== 'string') return FALLBACK_NAME
  if (displayName.trim() === '') return FALLBACK_NAME
  return displayName
}

export function generateSubject(): string {
  return '【REALPROOF】お知らせ配信のご承認をお願いします'
}

export function generateTextBody(
  displayName: string | null,
  optinUrl: string
): string {
  const name = resolveDisplayName(displayName)

  return [
    `${name}様`,
    '',
    '過去にREALPROOFで投票いただきありがとうございました。',
    '',
    'REALPROOFでは、投票してくださった方へ',
    '「あなたが応援したプロ」からのお知らせを',
    'お届けする仕組みを整えました。',
    '',
    'ただし、ご本人のご承認をいただいた方にのみ',
    'お送りしたいと考えています。',
    'つきましては、以下のお知らせの受信を',
    'ご承認いただけますでしょうか。',
    '',
    '  ・プロからの返信メッセージ (Voice返信)',
    '  ・あなたの応援でプロが達成した新バッジ',
    '  ・プロからのリワード (設定されている場合)',
    '  ・REALPROOF の新機能・キャンペーン情報',
    '',
    '▼ ご承認はワンクリックで完了します',
    '',
    '[  承認する  ]',
    optinUrl,
    '',
    '承認いただかない場合は、何もしていただかなくて大丈夫です。',
    'このメール以降、こちらからご連絡することはありません。',
    '',
    '──────────',
    '',
    '📱 LINEで受け取りたい方へ',
    '',
    'LINE公式アカウントを友達追加していただくと、',
    '即時通知 + リッチな表示でご覧いただけます。',
    '',
    '▶ LINE公式アカウントを友達追加',
    'https://lin.ee/z5b13KM',
    '',
    '──────────',
    '',
    'このメールは過去にREALPROOFで投票された方に',
    '1度だけお送りしているご案内です。',
    '',
    'REALPROOF',
    '強みが、あなたを定義する。',
    'https://realproof.jp',
  ].join('\n')
}

export function generateHtmlBody(
  displayName: string | null,
  optinUrl: string
): string {
  const name = resolveDisplayName(displayName)
  const subject = generateSubject()

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

              <p style="margin:0 0 16px;font-size:15px;line-height:1.8;color:#1A1A2E;">
                過去にREALPROOFで投票いただきありがとうございました。
              </p>

              <p style="margin:0 0 16px;font-size:15px;line-height:1.8;color:#1A1A2E;">
                REALPROOFでは、投票してくださった方へ<br>
                「あなたが応援したプロ」からのお知らせを<br>
                お届けする仕組みを整えました。
              </p>

              <p style="margin:0 0 16px;font-size:15px;line-height:1.8;color:#1A1A2E;">
                ただし、ご本人のご承認をいただいた方にのみ<br>
                お送りしたいと考えています。<br>
                つきましては、以下のお知らせの受信を<br>
                ご承認いただけますでしょうか。
              </p>

              <!-- お知らせ内容リスト -->
              <ul style="margin:0 0 24px;padding-left:24px;font-size:14px;line-height:1.9;color:#1A1A2E;">
                <li>プロからの返信メッセージ (Voice返信)</li>
                <li>あなたの応援でプロが達成した新バッジ</li>
                <li>プロからのリワード (設定されている場合)</li>
                <li>REALPROOF の新機能・キャンペーン情報</li>
              </ul>

              <p style="margin:0 0 16px;font-size:14px;line-height:1.8;color:#1A1A2E;text-align:center;">
                ▼ ご承認はワンクリックで完了します
              </p>

              <!-- CTA: 承認するボタン -->
              <div style="text-align:center;margin:24px 0 32px;">
                <a href="${optinUrl}" style="display:inline-block;background-color:#C4A35A;color:#FFFFFF;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">承認する</a>
              </div>

              <p style="margin:0 0 24px;font-size:14px;line-height:1.8;color:#666;">
                承認いただかない場合は、何もしていただかなくて大丈夫です。<br>
                このメール以降、こちらからご連絡することはありません。
              </p>

              <hr style="border:0;border-top:1px solid #E5E5E5;margin:24px 0;">

              <!-- LINE セクション -->
              <p style="margin:0 0 12px;font-size:15px;line-height:1.8;color:#1A1A2E;font-weight:bold;">
                📱 LINEで受け取りたい方へ
              </p>

              <p style="margin:0 0 16px;font-size:14px;line-height:1.8;color:#1A1A2E;">
                LINE公式アカウントを友達追加していただくと、<br>
                即時通知 + リッチな表示でご覧いただけます。
              </p>

              <div style="text-align:center;margin:16px 0 24px;">
                <a href="https://lin.ee/z5b13KM" style="display:inline-block;background-color:#06C755;color:#FFFFFF;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:13px;">▶ LINE公式アカウントを友達追加</a>
              </div>

              <hr style="border:0;border-top:1px solid #E5E5E5;margin:24px 0;">

              <!-- フッター -->
              <p style="margin:0 0 16px;font-size:12px;line-height:1.7;color:#666;">
                このメールは過去にREALPROOFで投票された方に<br>
                1度だけお送りしているご案内です。
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

// 期待動作:
// generateTextBody("山田", "https://realproof.jp/optin?token=abc&email=test%40example.com")
//   → "山田様\n\n過去にREALPROOFで..." で始まり、{{optinUrl}} が置換されたテキスト
//
// generateTextBody(null, "https://...")
//   → "お客様\n\n過去にREALPROOFで..." (displayName が null の場合は「お客」)
//
// generateTextBody("", "https://...")
//   → "お客様\n\n..." (空文字も「お客」扱い)
//
// generateTextBody("  ", "https://...")
//   → "お客様\n\n..." (空白のみも「お客」扱い、trim判定)
