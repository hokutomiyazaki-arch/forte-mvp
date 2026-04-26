/**
 * 表示名から苗字を抽出する。
 * 半角スペース・全角スペース両方で分割し、最初の部分を返す。
 *
 * 例:
 *   "山田 太郎"  → "山田"
 *   "山田　太郎" → "山田"
 *   "山田太郎"   → "山田太郎"  // 区切りが無い場合はそのまま
 *   ""           → ""
 *   null         → ""
 */
export const getSurname = (fullName: string | null | undefined): string => {
  if (!fullName) return ''
  const trimmed = fullName.trim()
  if (!trimmed) return ''
  const parts = trimmed.split(/[\s\u3000]+/)
  return parts[0] || trimmed
}
