/**
 * LINE Messaging API — シンプルテキストPush送信
 *
 * weekly-report の send-line.ts はFlex Message専用。
 * こちらはブロードキャスト等で使う汎用テキストPush関数。
 */

export async function sendLinePushText(
  lineUserId: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN
  if (!accessToken) {
    return { success: false, error: 'LINE_MESSAGING_CHANNEL_ACCESS_TOKEN not set' }
  }

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: 'text', text }],
      }),
    })

    if (res.ok) {
      return { success: true }
    }

    const errBody = await res.text()
    console.error(`[line-push] Push error for ${lineUserId}:`, res.status, errBody)
    return { success: false, error: `LINE ${res.status}: ${errBody}` }
  } catch (err: any) {
    console.error(`[line-push] Send error for ${lineUserId}:`, err)
    return { success: false, error: err.message || 'Network error' }
  }
}
