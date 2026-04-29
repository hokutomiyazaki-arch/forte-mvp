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
