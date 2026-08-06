/**
 * 相談フォーム（§16-19）の通知
 *
 * 動き方:
 *   クライアント → RP内フォームで送信 → プロへ通知(LINE優先→メール)
 *   プロ → ダッシュボードで返信を書く → クライアントへメール
 *   クライアントはメール内の「返信する」リンク(access_token付き)でフォームに戻る
 *   ※ Resend は送信専用でメールの返信を受け取れないため、この往復導線が必須。
 *
 * PII注意: クライアントのメールアドレスは API レスポンスに出さない（プロのダッシュボードのみ）。
 * 通知の成否は主処理(相談の保存)の成否に影響させない（呼び出し側で try/catch する前提）。
 *
 * import は line-push のみに絞っている。referral-notify から escapeHtml を借りると
 * clerkClient が公開APIルート側のチャンクに入るため、ここで小さく持つ（CLAUDE.md G）。
 */

import { sendLinePushText } from '@/lib/line-push'

// 外部に配るURLは origin ではなくハードコード（preview デプロイのURLが顧客に届くのを防ぐ）
const APP_URL = 'https://realproof.jp'

/** メールHTMLに埋め込むユーザー由来文字列は必ずこれを通す（HTMLインジェクション対策）。 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 改行を <br> に（escapeHtml の後に呼ぶこと）。 */
function nl2br(escaped: string): string {
  return escaped.replace(/\n/g, '<br>')
}

async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        from: 'REAL PROOF <noreply@realproof.jp>',
        to,
        subject,
        html,
      }),
    })
    if (res.ok) return true
    // Resendのエラー本文には宛先メールが含まれうるためログに出さない。statusのみ。
    console.error('[consultation-notify] Resend error:', res.status)
    return false
  } catch (err) {
    console.error('[consultation-notify] Email send error:', err)
    return false
  }
}

const WRAP_START = `<div style="font-family:sans-serif;line-height:1.7;color:#1A1A2E;max-width:560px">`
const WRAP_END = `</div>`

/** 返信不可の明記（Resendは送信専用。返信メールは誰にも届かない）。 */
const NO_REPLY_NOTE = `<p style="font-size:12px;color:#9CA3AF;margin-top:24px">
このメールには返信できません。やりとりは上のリンクからお願いします。
</p>`

/**
 * クライアントへ「相談を受け付けました」。
 * この時点で access_token 付きリンクを渡しておく（プロの返信を待たずに追記できるように）。
 */
export async function notifyClientConsultationReceived(params: {
  clientEmail: string
  clientName: string
  proName: string
  token: string
}): Promise<boolean> {
  const url = `${APP_URL}/consult/thread/${params.token}`
  const html = `${WRAP_START}
<p>${escapeHtml(params.clientName)} 様</p>
<p>${escapeHtml(params.proName)} さんへのご相談を受け付けました。<br>
お返事が届きましたらメールでお知らせします。</p>
<p style="margin:24px 0">
  <a href="${url}" style="background:#1A1A2E;color:#C4A35A;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">やりとりを開く</a>
</p>
<p style="font-size:13px;color:#6B7280">このリンクから追加のご質問も送れます。</p>
${NO_REPLY_NOTE}
${WRAP_END}`
  return sendMail(params.clientEmail, `【REAL PROOF】ご相談を受け付けました（${params.proName}さん）`, html)
}

/** プロへ「新しい相談が届きました」。LINE優先→contact_email。 */
export async function notifyProNewConsultation(params: {
  proName: string
  contactEmail: string | null
  lineUserId: string | null
  clientName: string
  body: string
}): Promise<{ sent: boolean; via: 'line' | 'email' | null }> {
  const url = `${APP_URL}/dashboard?tab=consultations`
  const preview = params.body.length > 80 ? `${params.body.slice(0, 80)}…` : params.body

  if (params.lineUserId) {
    const text = `新しいご相談が届きました\n\n${params.clientName} 様より\n「${preview}」\n\n返信はこちら\n${url}`
    const result = await sendLinePushText(params.lineUserId, text)
    if (result.success) return { sent: true, via: 'line' }
    // LINE失敗時はメールへフォールバック
  }

  if (params.contactEmail) {
    const html = `${WRAP_START}
<p>${escapeHtml(params.proName)} さん</p>
<p>新しいご相談が届きました。</p>
<div style="background:#F9FAFB;border-radius:8px;padding:16px;margin:16px 0">
  <p style="font-size:13px;color:#6B7280;margin:0 0 8px">${escapeHtml(params.clientName)} 様より</p>
  <p style="margin:0">${nl2br(escapeHtml(preview))}</p>
</div>
<p style="margin:24px 0">
  <a href="${url}" style="background:#1A1A2E;color:#C4A35A;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">ダッシュボードで返信する</a>
</p>
${NO_REPLY_NOTE}
${WRAP_END}`
    const ok = await sendMail(params.contactEmail, `【REAL PROOF】新しいご相談が届きました`, html)
    return { sent: ok, via: ok ? 'email' : null }
  }

  return { sent: false, via: null }
}

/**
 * クライアントへ「プロから返信が届きました」。
 * 【§16-19の狙い①】この本文の下に、後から「クライアントがプロを紹介する機能」の案内を足せる。
 * いまは REAL PROOF の説明を一行だけ置いている（機能ができたらここを差し替える）。
 */
export async function notifyClientProReplied(params: {
  clientEmail: string
  clientName: string
  proName: string
  body: string
  token: string
}): Promise<boolean> {
  const url = `${APP_URL}/consult/thread/${params.token}`
  const html = `${WRAP_START}
<p>${escapeHtml(params.clientName)} 様</p>
<p>${escapeHtml(params.proName)} さんからお返事が届きました。</p>
<div style="background:#F9FAFB;border-radius:8px;padding:16px;margin:16px 0">
  <p style="margin:0">${nl2br(escapeHtml(params.body))}</p>
</div>
<p style="margin:24px 0">
  <a href="${url}" style="background:#1A1A2E;color:#C4A35A;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">続けてやりとりする</a>
</p>
<hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0">
<p style="font-size:12px;color:#9CA3AF">
REAL PROOF は、実際に施術を受けた人だけが記録を残せるサービスです。
</p>
${NO_REPLY_NOTE}
${WRAP_END}`
  return sendMail(params.clientEmail, `【REAL PROOF】${params.proName}さんからお返事が届きました`, html)
}

/** プロへ「クライアントから追加の連絡」。 */
export async function notifyProClientReplied(params: {
  proName: string
  contactEmail: string | null
  lineUserId: string | null
  clientName: string
  body: string
}): Promise<boolean> {
  const url = `${APP_URL}/dashboard?tab=consultations`
  const preview = params.body.length > 80 ? `${params.body.slice(0, 80)}…` : params.body

  if (params.lineUserId) {
    const text = `ご相談に返信が届きました\n\n${params.clientName} 様より\n「${preview}」\n\n${url}`
    const result = await sendLinePushText(params.lineUserId, text)
    if (result.success) return true
  }
  if (params.contactEmail) {
    const html = `${WRAP_START}
<p>${escapeHtml(params.proName)} さん</p>
<p>${escapeHtml(params.clientName)} 様のご相談に、追加のメッセージが届きました。</p>
<div style="background:#F9FAFB;border-radius:8px;padding:16px;margin:16px 0">
  <p style="margin:0">${nl2br(escapeHtml(preview))}</p>
</div>
<p style="margin:24px 0">
  <a href="${url}" style="background:#1A1A2E;color:#C4A35A;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">ダッシュボードで見る</a>
</p>
${NO_REPLY_NOTE}
${WRAP_END}`
    return sendMail(params.contactEmail, `【REAL PROOF】ご相談に返信が届きました`, html)
  }
  return false
}
