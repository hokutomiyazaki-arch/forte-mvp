/**
 * 共通バリデーションヘルパー
 *
 * Phase 2 で setup ウィザード Step 4 と dashboard プロフ編集の両方で
 * 同じロジックを使うため、ここに集約。
 */

/**
 * 予約・連絡先 URL のバリデーション。
 *
 * 受け入れ条件:
 *   - 空文字 → OK (任意入力)
 *   - http:// または https:// で始まる
 *   - URL parse 成功 + hostname にドット ('.') を含む
 *
 * 既存 25 人の入力例 (CLAUDE.md / 移行調査時に確認済) を弾かない設計:
 *   - http://www.proud-s.com (http のみでも OK)
 *   - https://lin.ee/... (LINE 公式 URL)
 *   - @maru_osteopathy のような handle のみは弾く (URL 形式違反)
 */
export function validateBookingUrl(url: string): { valid: boolean; error: string } {
  const trimmed = url.trim()
  if (!trimmed) return { valid: true, error: '' }

  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      valid: false,
      error: 'URLは http:// または https:// で始めてください',
    }
  }

  try {
    const u = new URL(trimmed)
    if (!u.hostname || !u.hostname.includes('.')) {
      return { valid: false, error: 'URL の形式が正しくありません' }
    }
  } catch {
    return { valid: false, error: 'URL の形式が正しくありません' }
  }

  return { valid: true, error: '' }
}

/**
 * Phase A2: 任意 URL のバリデーション(空 OK / http(s):// 必須 / hostname に . 含む)
 * label はエラーメッセージ用("公式HP URL" など)。
 */
export function validateOptionalUrl(url: string, label: string): { valid: boolean; error: string } {
  const trimmed = url.trim()
  if (!trimmed) return { valid: true, error: '' }

  if (!/^https?:\/\//i.test(trimmed)) {
    return { valid: false, error: `${label} は http:// または https:// で始めてください` }
  }

  try {
    const u = new URL(trimmed)
    if (!u.hostname || !u.hostname.includes('.')) {
      return { valid: false, error: `${label} の形式が正しくありません` }
    }
  } catch {
    return { valid: false, error: `${label} の形式が正しくありません` }
  }

  return { valid: true, error: '' }
}

/**
 * Phase A2: SNS ハンドルのバリデーション(空 OK / 先頭 @ 自動剥がし / 半角英数字・_・. のみ・1〜30文字)
 * normalized は @ を剥がした保存用の値。空文字のときは ''。
 */
export function validateSocialHandle(
  handle: string,
  label: string
): { valid: boolean; error: string; normalized: string } {
  const trimmed = handle.trim()
  if (!trimmed) return { valid: true, error: '', normalized: '' }

  const stripped = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
  if (!/^[A-Za-z0-9_.]{1,30}$/.test(stripped)) {
    return {
      valid: false,
      error: `${label} のユーザー名は半角英数字・_・. のみ(30文字以内)で入力してください`,
      normalized: stripped,
    }
  }

  return { valid: true, error: '', normalized: stripped }
}

/**
 * Phase A2: 電話番号のバリデーション(空 OK / 数字・ハイフン・カッコ・+・空白のみ・6〜20文字)
 */
export function validatePhoneNumber(phone: string): { valid: boolean; error: string } {
  const trimmed = phone.trim()
  if (!trimmed) return { valid: true, error: '' }

  if (!/^[0-9+\-()\s]{6,20}$/.test(trimmed)) {
    return {
      valid: false,
      error: '電話番号は数字・ハイフン・カッコ・+ で 6〜20 文字で入力してください',
    }
  }

  return { valid: true, error: '' }
}

/**
 * Phase A2: 徒歩分数のバリデーション(空 OK / 整数 / 0〜99)
 */
export function validateWalkMinutes(min: '' | number | null | undefined): { valid: boolean; error: string } {
  if (min === '' || min === null || min === undefined) return { valid: true, error: '' }
  const n = typeof min === 'number' ? min : Number(min)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 99) {
    return { valid: false, error: '徒歩分数は 0〜99 の整数で入力してください' }
  }
  return { valid: true, error: '' }
}

/**
 * Phase A2: 営業形態のバリデーション(全要素が 'store' | 'visit' | 'online' のいずれか)
 */
export function validateServiceFormats(arr: string[]): { valid: boolean; error: string } {
  if (!Array.isArray(arr)) return { valid: false, error: '営業形態の値が不正です' }
  const allowed = new Set(['store', 'visit', 'online'])
  for (const v of arr) {
    if (!allowed.has(v)) {
      return { valid: false, error: `営業形態の値「${v}」は無効です` }
    }
  }
  return { valid: true, error: '' }
}
