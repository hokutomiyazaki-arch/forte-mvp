/**
 * §17-16(CEO指示 2026-08-06): 紹介予約でクライアントのメールが届かなかったとき、
 * 直す仕事を**紹介元（送り手プロ）**に持たせる。
 *
 * CEOの指示:
 *   「紹介予約でクライアントがメールを間違えてたとき、この仕事は予約金を受け取るプロに
 *     させたら？ クライアントに電話してメールアドレスを修整して入力してもらってください。
 *     というメールとクライアント電話番号が、受けてではなく、送り元のプロに行くようにしたら？」
 *
 * なぜ送り手が正しいか:
 *   - 送り手は**そのクライアントを知っている**（自分が紹介した相手）。電話するのに無理がない。
 *     受け手にとっては会ったこともない他人で、しかもまだ1円も受け取っていない。
 *   - 紹介報酬は成立しないと入らないので、直す動機がいちばん強いのも送り手。
 *   - 電話番号の開示先としても、紹介した本人のほうが飛躍が小さい。
 *
 * なぜ受け手を残すか（フォールバックが要る理由）:
 *   - **直接予約(source='direct')には送り手がいない**。ここは従来どおり受け手が直す。
 *   - 送り手が動かない場合に予約が黙って死ぬ。一定時間で受け手に渡す。
 *
 * このファイルは import ゼロの純関数のみ（APIルートのチャンクグラフに何も足さない・CLAUDE.md §G）。
 */

/** 送り手に預ける時間。これを過ぎたら受け手が自分で直せるようにする。 */
export const EMAIL_FIX_SENDER_WINDOW_HOURS = 24

export type EmailFixOwner = 'sender' | 'receiver'

export interface EmailFixOwnerInput {
  /** 紹介元プロがいるか（直接予約なら false） */
  hasSender: boolean
  /** メールが届いていない印が立っているか */
  receiptEmailFailed: boolean
  status: string
  /** 印が立った時刻(ISO)。webhook が記録する。古い行には無いので createdAt で代用する。 */
  failedAt?: string | null
  createdAt?: string | null
  /** テスト用。既定は現在時刻。 */
  nowMs?: number
}

/**
 * 「いま誰がメールアドレスを直すべきか」。対象外なら null。
 *
 * 進行中(requested/confirmed)でメールが死んでいる予約だけが対象。
 * 送り手がいて、まだ預けた時間内なら 'sender'。それ以外は 'receiver'。
 */
export function resolveEmailFixOwner(input: EmailFixOwnerInput): EmailFixOwner | null {
  if (!input.receiptEmailFailed) return null
  if (input.status !== 'requested' && input.status !== 'confirmed') return null
  if (!input.hasSender) return 'receiver'

  const startedAt = input.failedAt || input.createdAt
  if (!startedAt) return 'sender'
  const startedMs = Date.parse(startedAt)
  if (!Number.isFinite(startedMs)) return 'sender'

  const now = typeof input.nowMs === 'number' ? input.nowMs : Date.now()
  const elapsedHours = (now - startedMs) / (1000 * 60 * 60)
  return elapsedHours < EMAIL_FIX_SENDER_WINDOW_HOURS ? 'sender' : 'receiver'
}
