/**
 * §17-19(CEO指示 2026-08-06): SMS送信。
 *
 * 何のために入れるか:
 *   メールは「送れたのに届かない」ことがある（打ち間違い・迷惑メール判定・キャリア遮断）。
 *   そのとき**予約金の支払い案内が一切届かず、予約が成立しない**。
 *   電話番号は予約フォームの必須項目なので、SMSなら必ず1本は通る道が残る。
 *
 * CEO:「これを登録したら、既存のプロに電話させる流れも削除したい」
 *   → SMSが送れたら §17-16 の人力フロー（送り手が電話してアドレスを聞く）は**出さない**。
 *     人が電話するのは「SMSも届かなかった＝電話番号まで間違っている」ときだけになる。
 *
 * 設計:
 *   - 未設定の間は何もしない（`isSmsEnabled()` が false）。既存の挙動は1ミリも変わらない。
 *     決済(`isReferralPaymentEnabled`)と同じく**環境変数の有無だけ**で切り替える。
 *   - Twilio SDK は入れず REST を fetch で叩く。依存を増やさず、APIルートの
 *     チャンクグラフにも重いものを持ち込まない（CLAUDE.md §G）。
 *   - 本文にPIIを入れない。名前も金額も書かず、短いリンクだけ送る
 *     （SMSは家族と共有の端末で見られることがある）。
 */

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01'

export function isSmsEnabled(): boolean {
  return (
    !!process.env.TWILIO_ACCOUNT_SID &&
    !!process.env.TWILIO_AUTH_TOKEN &&
    !!process.env.TWILIO_SMS_FROM
  )
}

/**
 * 日本の携帯番号を E.164 に直す。
 * 予約フォームは「090-1234-5678」「09012345678」等の国内表記で入ってくるため、
 * そのまま渡すと Twilio が 21211(Invalid 'To') を返す。
 * 既に +81 / +その他の国番号で入っているものはそのまま通す（在外のクライアント対策）。
 * 携帯以外（固定電話）はSMSが届かないので送らない = null を返す。
 */
export function toE164Jp(raw: string | null | undefined): string | null {
  if (!raw) return null
  // 全角数字・ハイフン・空白・括弧を落として数字と + だけにする
  const normalized = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^\d+]/g, '')
  if (!normalized) return null

  if (normalized.startsWith('+')) {
    return /^\+\d{8,15}$/.test(normalized) ? normalized : null
  }
  // 0X0-XXXX-XXXX（携帯/PHS: 070/080/090）のみ対象。固定電話にSMSは届かない。
  if (/^0[789]0\d{8}$/.test(normalized)) {
    return `+81${normalized.slice(1)}`
  }
  // 国内表記で 81 始まりの11桁超（+ を打ち忘れたケース）
  if (/^81[789]0\d{8}$/.test(normalized)) {
    return `+${normalized}`
  }
  return null
}

export interface SendSmsResult {
  sent: boolean
  /** 送らなかった理由（ログ・分岐用）。'disabled'=未設定, 'invalid_to'=携帯番号ではない */
  reason?: 'disabled' | 'invalid_to' | 'api_error' | 'exception'
}

/**
 * SMSを1通送る。失敗しても例外は投げない（呼び出し元の主処理を落とさない）。
 * to は国内表記でよい（内部で E.164 に直す）。
 */
export async function sendSms(to: string | null | undefined, body: string): Promise<SendSmsResult> {
  if (!isSmsEnabled()) return { sent: false, reason: 'disabled' }

  const toE164 = toE164Jp(to)
  if (!toE164) return { sent: false, reason: 'invalid_to' }

  const accountSid = process.env.TWILIO_ACCOUNT_SID as string
  const authToken = process.env.TWILIO_AUTH_TOKEN as string
  const from = process.env.TWILIO_SMS_FROM as string

  try {
    const params = new URLSearchParams({ To: toE164, From: from, Body: body })
    const res = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      cache: 'no-store',
      body: params.toString(),
    })
    if (res.ok) return { sent: true }
    // エラー本文には宛先番号が含まれうるのでログに出さない。statusのみ記録する
    // （referral-notify の Resend エラーと同じ作法）。
    console.error('[sms] Twilio error:', res.status)
    return { sent: false, reason: 'api_error' }
  } catch (err) {
    console.error('[sms] send error:', err)
    return { sent: false, reason: 'exception' }
  }
}
