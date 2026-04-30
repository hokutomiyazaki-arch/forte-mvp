/**
 * Weekly Proof Report — Resendメール送信
 */

export async function sendWeeklyEmail(
  to: string,
  name: string,
  html: string,
): Promise<{ success: boolean; error?: string }> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return { success: false, error: 'RESEND_API_KEY not set' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'REALPROOF <noreply@realproof.jp>',
        to,
        subject: `今週のあなたのプルーフ｜REALPROOF Weekly`,
        html,
      }),
    })

    if (res.ok) {
      return { success: true }
    }

    const errBody = await res.text()
    console.error(`[weekly-report] Resend error for ${to}:`, res.status, errBody)
    return { success: false, error: `Resend ${res.status}: ${errBody}` }
  } catch (err: any) {
    console.error(`[weekly-report] Send error for ${to}:`, err)
    return { success: false, error: err.message || 'Network error' }
  }
}
