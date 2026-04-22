/**
 * vote-auth-helpers — Clerk ユーザーから auth_method / auth_display_name を
 * 統一的に導出する。client-side (useUser) と server-side (clerkClient.users.getUser)
 * の両方の User オブジェクトに duck-typing で対応する。
 */

// client-side (UserResource) と server-side (User) の両方を受け入れる最小構造
export type ClerkUserLike = {
  id?: string
  firstName?: string | null
  lastName?: string | null
  fullName?: string | null
  username?: string | null
  imageUrl?: string | null

  // client-side: オブジェクト
  // server-side: オブジェクト（emailAddresses 配列から primaryEmailAddressId で解決済み）
  primaryEmailAddress?: {
    emailAddress?: string | null
    verification?: { strategy?: string | null } | null
  } | string | null

  primaryPhoneNumber?: {
    phoneNumber?: string | null
  } | string | null

  // server-side で必要
  emailAddresses?: Array<{
    id?: string
    emailAddress?: string | null
    verification?: { strategy?: string | null } | null
  }>
  primaryEmailAddressId?: string | null

  externalAccounts?: Array<{
    provider?: string | null
  }>
}

/**
 * 表示名を優先順位で抽出する:
 *   姓+名 → fullName → firstName → username → null
 *
 * LINE は firstName のみのケースが多い。
 */
export function extractDisplayName(clerkUser: ClerkUserLike | null | undefined): string | null {
  if (!clerkUser) return null
  if (clerkUser.lastName && clerkUser.firstName) {
    return `${clerkUser.lastName} ${clerkUser.firstName}`
  }
  if (clerkUser.fullName) return clerkUser.fullName
  if (clerkUser.firstName) return clerkUser.firstName
  if (clerkUser.username) return clerkUser.username
  return null
}

// ── 内部ユーティリティ: client/server 両対応で email/phone/strategy を取り出す ──

function getPrimaryEmail(clerkUser: ClerkUserLike): string | null {
  // client-side: primaryEmailAddress.emailAddress に直接ある
  const pea = clerkUser.primaryEmailAddress
  if (pea && typeof pea === 'object' && pea.emailAddress) return pea.emailAddress
  // server-side: emailAddresses 配列から primaryEmailAddressId で検索
  if (clerkUser.primaryEmailAddressId && Array.isArray(clerkUser.emailAddresses)) {
    const hit = clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)
    if (hit?.emailAddress) return hit.emailAddress
  }
  return null
}

function getPrimaryPhone(clerkUser: ClerkUserLike): string | null {
  const ppn = clerkUser.primaryPhoneNumber
  if (ppn && typeof ppn === 'object' && ppn.phoneNumber) return ppn.phoneNumber
  return null
}

function getEmailStrategy(clerkUser: ClerkUserLike): string | null {
  const pea = clerkUser.primaryEmailAddress
  if (pea && typeof pea === 'object' && pea.verification?.strategy) {
    return pea.verification.strategy
  }
  // server-side fallback
  if (clerkUser.primaryEmailAddressId && Array.isArray(clerkUser.emailAddresses)) {
    const hit = clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)
    if (hit?.verification?.strategy) return hit.verification.strategy
  }
  return null
}

export type AuthMethod = 'line' | 'google' | 'sms' | 'email_code' | 'unknown'

/**
 * Clerk ユーザーから auth_method を判別する。
 *
 * identity マトリックス（判定順）:
 *   1. phone 有り & email 無し                              → 'sms'
 *   2. email の verification.strategy が認識可能な値:
 *      - 'from_oauth_google'                                → 'google'
 *      - 'from_oauth_line'                                  → 'line'
 *      - 'email_code' | 'email_link' | 'from_code'          → 'email_code'
 *   3. email / phone 両方無い（LINE で email 権限未承認 等）:
 *      externalAccounts の provider で判定:
 *      - 'oauth_line'                                       → 'line'
 *      - 'oauth_google'                                     → 'google'
 *   4. どれにも当てはまらない                                → 'unknown'
 *      （console.warn でログ出力。DB には 'unknown' が保存される）
 */
export function determineAuthMethod(clerkUser: ClerkUserLike | null | undefined): AuthMethod {
  if (!clerkUser) return 'unknown'

  const email = getPrimaryEmail(clerkUser)
  const phone = getPrimaryPhone(clerkUser)
  const strategy = getEmailStrategy(clerkUser)

  // 1. phone only → SMS
  if (phone && !email) return 'sms'

  // 2. email strategy-based
  if (email) {
    if (strategy === 'from_oauth_google') return 'google'
    if (strategy === 'from_oauth_line') return 'line'
    if (strategy === 'email_code' || strategy === 'email_link' || strategy === 'from_code') {
      return 'email_code'
    }
  }

  // 3. externalAccounts フォールバック
  //    LINE でメール権限未承認のケースで email=null, phone=null になるため必要
  const ext = clerkUser.externalAccounts || []
  for (const acc of ext) {
    if (acc.provider === 'oauth_line') return 'line'
    if (acc.provider === 'oauth_google') return 'google'
  }

  // 4. 判定不能 — 警告ログを残す
  try {
    console.warn('[determineAuthMethod] Unknown auth method', {
      id: clerkUser.id,
      hasEmail: !!email,
      hasPhone: !!phone,
      strategy,
      externalProviders: ext.map(e => e.provider),
    })
  } catch {
    // ログ失敗は無視
  }
  return 'unknown'
}
