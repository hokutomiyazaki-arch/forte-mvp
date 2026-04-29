/**
 * リワードメール HTML/text テンプレート
 *
 * 投票完了 + reward_optin=true の voter に送る、プロからのお礼メール。
 *
 * 2 パターン対応:
 *   - パターン A (reward あり)   : 件名「○○さんからリワードが届きました」+ リワードボックス
 *   - パターン B (reward なし)   : 件名「○○さんを応援いただきありがとうございます」+ 未設定案内
 *
 * デザイン方針:
 *   - Dark (#1A1A2E) + Gold (#C4A35A) のプレミアム配色 (REALPROOF ブランド)
 *   - インライン CSS 必須 (Gmail などで <style> タグが無視されるため)
 *   - 600px 幅 (メールクライアント標準)
 *   - HTML / プレーンテキスト両方を生成
 *
 * 共通: 配信停止リンク、UTM 付与、予約URL/プロフィールボタン。
 *       「メッセージ」という単語は使わない (Phase 3 まで未実装のため)。
 */

export interface RewardEmailParams {
  proName: string
  proPhotoUrl: string | null
  proTitle: string
  proId: string
  reward: {
    title: string | null
    content: string
    url?: string | null
  } | null
  bookingUrl: string | null
  voteId: string
  voterEmail: string
}

export interface RewardEmailResult {
  subject: string
  html: string
  text: string
}

/**
 * 任意 URL に UTM パラメータを追加。URL parse 失敗時は元 URL をそのまま返す。
 */
export function appendUtmParams(url: string, params: Record<string, string>): string {
  try {
    const u = new URL(url)
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    return u.toString()
  } catch {
    return url
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function buildRewardEmail(params: RewardEmailParams): RewardEmailResult {
  const { proName, proPhotoUrl, proTitle, proId, reward, bookingUrl, voteId, voterEmail } = params
  const hasReward = !!reward

  // ── 件名 ──
  const subject = hasReward
    ? `${proName}さんからリワードが届きました`
    : `${proName}さんを応援いただきありがとうございます`

  // ── 公開 URL (受信側がクリックする外部リンクなので env の本番URL を使う) ──
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://realproof.jp'

  const trackedBookingUrl = bookingUrl
    ? appendUtmParams(bookingUrl, {
        utm_source: 'realproof',
        utm_medium: 'reward_email',
        utm_campaign: 'next_booking',
        utm_content: voteId,
      })
    : null

  const trackedCardUrl = appendUtmParams(`${siteUrl}/card/${proId}`, {
    utm_source: 'realproof',
    utm_medium: 'reward_email',
    utm_campaign: 'pro_card',
    utm_content: voteId,
  })

  const unsubscribeUrl = `${siteUrl}/unsubscribe?vote_id=${encodeURIComponent(voteId)}&email=${encodeURIComponent(voterEmail)}`

  // ── 本文ヘッダー (両パターン共通の冒頭 2 行 + 3 行目で分岐) ──
  const headerCommon = `
    <p style="margin:0 0 16px;color:#FFFFFF;font-size:16px;line-height:1.7;">
      先日は ${escapeHtml(proName)}さんを応援していただき、<br>ありがとうございました。
    </p>
    <p style="margin:0 0 16px;color:#FFFFFF;font-size:16px;line-height:1.7;">
      あなたの一票が ${escapeHtml(proName)}さんの<br>次のステージへの後押しになっています。
    </p>`

  const headerDiff = hasReward
    ? `<p style="margin:0;color:#FFFFFF;font-size:16px;line-height:1.7;">
         ${escapeHtml(proName)}さんから、リワードが届いています。
       </p>`
    : `<p style="margin:0 0 8px;color:#FFFFFF;font-size:16px;line-height:1.7;">
         ${escapeHtml(proName)}さんはまだリワードを設定していません。
       </p>
       <p style="margin:0;color:#C4A35A;font-size:14px;line-height:1.7;">
         設定されたらお知らせします。
       </p>`

  // ── リワードボックス (パターン A のみ) ──
  const rewardBox = hasReward && reward
    ? `
      <tr>
        <td style="padding:0 40px 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(196,163,90,0.08);border:1px solid rgba(196,163,90,0.3);border-radius:8px;">
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 12px;color:#C4A35A;font-size:12px;letter-spacing:1px;font-weight:600;">REWARD</p>
                ${reward.title ? `<p style="margin:0 0 12px;color:#FFFFFF;font-size:18px;font-weight:600;">${escapeHtml(reward.title)}</p>` : ''}
                <p style="margin:0;color:#E8E8E8;font-size:14px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(reward.content)}</p>
                ${reward.url ? `<p style="margin:20px 0 0;text-align:center;"><a href="${escapeHtml(reward.url)}" style="display:inline-block;padding:12px 32px;background-color:#C4A35A;color:#1A1A2E;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">リワードを開く</a></p>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : ''

  // ── CTA ボタン群 (booking_url + プロフィール) ──
  const ctaRow = `
    <tr>
      <td style="padding:0 40px 40px;text-align:center;">
        ${trackedBookingUrl ? `
        <p style="margin:0 0 14px;color:#999;font-size:13px;">次回のご予約はこちらから</p>
        <p style="margin:0 0 14px;text-align:center;">
          <a href="${escapeHtml(trackedBookingUrl)}" style="display:inline-block;padding:14px 40px;background-color:transparent;color:#C4A35A;text-decoration:none;border:1px solid #C4A35A;border-radius:6px;font-weight:500;font-size:14px;letter-spacing:0.5px;">${escapeHtml(proName)}さんに予約する</a>
        </p>
        ` : ''}
        <p style="margin:${trackedBookingUrl ? '14px' : '0'} 0 0;text-align:center;">
          <a href="${escapeHtml(trackedCardUrl)}" style="display:inline-block;padding:12px 32px;color:#999;text-decoration:none;border:1px solid rgba(255,255,255,0.15);border-radius:6px;font-weight:400;font-size:13px;">プロフィールを見る</a>
        </p>
      </td>
    </tr>`

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#FAFAF7;font-family:'Hiragino Sans','Noto Sans JP',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAFAF7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#1A1A2E;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:40px 40px 20px;text-align:center;">
              <p style="margin:0;color:#C4A35A;font-size:14px;letter-spacing:2px;font-weight:300;">REALPROOF</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 30px;text-align:center;">
              ${proPhotoUrl ? `<img src="${escapeHtml(proPhotoUrl)}" alt="${escapeHtml(proName)}" width="80" height="80" style="border-radius:50%;border:2px solid #C4A35A;object-fit:cover;">` : ''}
              <p style="margin:16px 0 4px;color:#FFFFFF;font-size:20px;font-weight:600;">
                ${escapeHtml(proName)}<span style="font-size:14px;font-weight:400;color:#C4A35A;">さん</span>
              </p>
              ${proTitle ? `<p style="margin:0;color:#999;font-size:13px;">${escapeHtml(proTitle)}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;background:linear-gradient(to right, transparent, #C4A35A, transparent);"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 40px 20px;">
              ${headerCommon}
              ${headerDiff}
            </td>
          </tr>
          ${rewardBox}
          ${ctaRow}
          <tr>
            <td style="padding:30px 40px 40px;border-top:1px solid rgba(255,255,255,0.1);">
              <p style="margin:0 0 8px;color:#666;font-size:11px;line-height:1.6;text-align:center;">
                このメールは REALPROOF からの自動配信です。<br>このメールへの返信はお受けできません。
              </p>
              <p style="margin:8px 0 0;text-align:center;">
                <a href="${escapeHtml(unsubscribeUrl)}" style="color:#666;font-size:11px;text-decoration:underline;">配信を停止する</a>
              </p>
            </td>
          </tr>
        </table>
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;margin-top:20px;">
          <tr>
            <td style="text-align:center;padding:20px;">
              <p style="margin:0;color:#999;font-size:11px;letter-spacing:1px;">REALPROOF — 強みのブロックチェーン</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  // ── プレーンテキスト ──
  const textLines: string[] = [
    subject,
    '',
    '────────────────────',
    `${proName}さん`,
    proTitle || '',
    '────────────────────',
    '',
    `先日は${proName}さんを応援していただき、ありがとうございました。`,
    `あなたの一票が${proName}さんの次のステージへの後押しになっています。`,
    '',
  ]

  if (hasReward && reward) {
    textLines.push(`${proName}さんから、リワードが届いています。`)
    textLines.push('')
    textLines.push('【REWARD】')
    if (reward.title) textLines.push(reward.title)
    textLines.push(reward.content)
    if (reward.url) textLines.push(`→ ${reward.url}`)
  } else {
    textLines.push(`${proName}さんはまだリワードを設定していません。`)
    textLines.push('設定されたらお知らせします。')
  }

  textLines.push('')
  if (trackedBookingUrl) {
    textLines.push('次回のご予約はこちらから:')
    textLines.push(trackedBookingUrl)
    textLines.push('')
  }
  textLines.push('プロフィールを見る:')
  textLines.push(trackedCardUrl)
  textLines.push('')
  textLines.push('────────────────────')
  textLines.push('このメールは REALPROOF からの自動配信です。')
  textLines.push('このメールへの返信はお受けできません。')
  textLines.push('')
  textLines.push(`配信停止: ${unsubscribeUrl}`)
  textLines.push('')
  textLines.push('REALPROOF — 強みのブロックチェーン')

  const text = textLines.filter((l) => l !== undefined).join('\n')

  return { subject, html, text }
}
