/**
 * メールアドレスを正規化して重複チェックに使う。
 * - Gmail: "+" 以降を削除 & ドットを削除 & googlemail.com → gmail.com
 * - その他: "+" 以降を削除
 * - 電話番号（+81...）: そのまま返す
 * - null/undefined: 空文字を返す
 */
export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return ''

  const trimmed = email.trim().toLowerCase()

  // 電話番号の場合はそのまま返す（+81で始まる or 数字のみ）
  if (trimmed.startsWith('+') && !trimmed.includes('@')) {
    return trimmed
  }

  // @ がなければそのまま返す
  if (!trimmed.includes('@')) {
    return trimmed
  }

  const [local, domain] = trimmed.split('@')

  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    // Gmail: "+" 以降を削除 & ドットを削除 & ドメイン統一
    const cleaned = local.split('+')[0].replace(/\./g, '')
    return `${cleaned}@gmail.com`
  }

  // Gmail以外: "+" 以降だけ削除
  const cleaned = local.split('+')[0]
  return `${cleaned}@${domain}`
}
