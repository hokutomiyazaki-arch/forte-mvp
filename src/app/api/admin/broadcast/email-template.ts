/**
 * Broadcast Email — HTMLテンプレート
 *
 * 管理者一斉送信用のシンプルなメールテンプレート。
 * weekly-report の email-template.ts のデザインパターンを踏襲。
 */

// ── ブランドカラー ──
const DARK = '#1A1A2E'
const GOLD = '#C4A35A'
const CREAM = '#FAFAF7'
const GRAY = '#8A8A9A'
const GRAY_DARK = '#4A4A5A'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://realproof.jp'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

/**
 * ブロードキャスト用メールHTML生成
 * @param name  宛先プロの名前
 * @param body  本文テキスト（改行は<br>に変換される）
 */
export function generateBroadcastEmailHTML(name: string, body: string): string {
  const headerBlock = `<tr><td style="padding:28px 32px 12px;text-align:center;">
  <div style="color:${GOLD};font-size:11px;font-weight:600;letter-spacing:0.15em;">REALPROOF</div>
  <div style="color:${CREAM};font-size:18px;font-weight:700;margin-top:4px;">お知らせ</div>
  <div style="color:${GRAY};font-size:11px;margin-top:4px;">${new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</td></tr>`

  const bodyBlock = `<tr><td style="padding:20px 32px;">
  <div style="color:${CREAM};font-size:14px;line-height:1.8;">
    ${escapeHtml(body)}
  </div>
</td></tr>`

  const ctaBlock = `<tr><td style="padding:28px 32px;text-align:center;">
  <a href="${APP_URL}/dashboard" style="display:inline-block;background:${GOLD};color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
    ダッシュボードを見る
  </a>
</td></tr>`

  const footerBlock = `<tr><td style="padding:20px 32px 28px;text-align:center;border-top:1px solid ${GRAY_DARK};">
  <div style="color:${GRAY};font-size:11px;">REALPROOF | 強みが、あなたを定義する。</div>
  <div style="color:${GRAY_DARK};font-size:10px;margin-top:4px;">このメールはREALPROOFに登録されたプロフェッショナルの方にお送りしています。</div>
</td></tr>`

  const content = [headerBlock, bodyBlock, ctaBlock, footerBlock].join('')

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${DARK};font-family:'Helvetica Neue',Arial,'Noto Sans JP',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${DARK};">
<tr><td align="center" style="padding:20px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${DARK};">
${content}
</table>
</td></tr>
</table>
</body>
</html>`
}
