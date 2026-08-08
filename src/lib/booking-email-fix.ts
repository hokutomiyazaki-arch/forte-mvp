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
  /**
   * §17-19(CEO指示 2026-08-06): 「これを登録したら、既存のプロに電話させる流れも削除したい」
   * SMSで本人に直接届いた予約は、プロが電話する必要が無い。ここで null を返し、
   * 送り手・受け手どちらの画面にも対応ブロックを出さない。
   */
  contactRecoveredBySms?: boolean
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
  // §17-19: SMSで本人に届いている＝人が電話する理由が無い。
  if (input.contactRecoveredBySms) return null
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

/**
 * §17-25(CEO報告 2026-08-07・本番不具合): 「hokutomiyaaaki312@gmail.com だと、メール不達が
 * 効いていない。他の間違いメールだとちゃんと出るのに。なぜ？」
 *
 * 真因: **Resend の抑制リスト（suppression list）**。
 *   一度ハードバウンスしたアドレスは Resend 側に記録され、次からは**実際に送信されない**。
 *   送らないのだから `email.bounced` の webhook も飛んでこない。
 *   結果、「初めて使う打ち間違い」は印が立ち、「前にも使った打ち間違い」は**立たない**。
 *   実データ:
 *     14:19 hokutomiyki312@…（初出）   → 送信 → バウンス → 4秒後に印が立った
 *     14:17 hokutomiyaaaki312@…（再利用）→ 抑制されて送られず → webhookも来ず → 印なし
 *     10:19 hokutomiyaaaki312@…（初出）→ 印が立っている（同じアドレスの1回目）
 *
 * これはテスト特有の話ではない。実際にも
 * 「アドレスを間違えたお客さんが、直さずにもう一度予約する」で普通に起きる。
 * しかも**2回目以降のほうが放置されやすい**（プロ側に何も出ないため）。
 *
 * 対処: webhook（相手からの通知）だけに頼らず、**こちらが既に知っている事実**を使う。
 *   同じアドレス宛で過去に未達だった予約が1件でもあれば、新しい予約は作成時点で未達として扱う。
 *   新しいテーブルは作らない（既存の preferred_slots のマーカーを読むだけ）。
 *
 * supabase クライアントは型だけ構造的に受ける（このファイルに import を持たせないため）。
 */
export async function isKnownUndeliverableEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  email: string | null | undefined,
): Promise<boolean> {
  const target = (email || '').trim().toLowerCase()
  if (!target) return false
  try {
    const { data, error } = await supabase
      .from('referral_bookings')
      .select('id, preferred_slots')
      .eq('client_email', target)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) {
      // 判定に失敗したら「知らない」として扱う（予約自体は通す。fail-soft）
      console.error('[booking-email-fix] isKnownUndeliverableEmail error (fail-soft):', error.message)
      return false
    }
    const failedInBookings = ((data || []) as Array<{ preferred_slots: Record<string, unknown> | null }>).some(
      (row) => !!row.preferred_slots?.receipt_email_failed,
    )
    if (failedInBookings) return true
  } catch (err) {
    console.error('[booking-email-fix] isKnownUndeliverableEmail error (fail-soft):', err)
    return false
  }

  // §17-27: 相談スレッド側の記録も見る。予約を経ずに相談だけ送った人は
  // referral_bookings に行が無いため、こちらを見ないと「初めて」と誤判定する。
  // email_failed_at は migration 058 依存なので、別クエリ＋fail-soft で読む
  // （未作成カラムを明示selectすると PostgREST が 42703 で落ちる）。
  try {
    const { data, error } = await supabase
      .from('consultations')
      .select('id, email_failed_at')
      .eq('client_email', target)
      .not('email_failed_at', 'is', null)
      .limit(1)
    if (error) {
      console.error('[booking-email-fix] consultations check error (fail-soft):', error.message)
      return false
    }
    return (data || []).length > 0
  } catch (err) {
    console.error('[booking-email-fix] consultations check error (fail-soft):', err)
    return false
  }
}
