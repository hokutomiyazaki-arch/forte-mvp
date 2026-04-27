/**
 * このファイルは VoiceShareCard.tsx の内部ヘルパーを複製したものです。
 * VoiceShareCard 改修禁止の制約下で popup と share card 両方で使うため。
 *
 * ⚠️ 同期更新責任:
 *   VoiceShareCard.tsx の getCommentFontSize / CARD_SHAPES /
 *   isLightBackground が変更されたら、このファイルも同じ変更を
 *   反映してください。
 *   Phase 5 以降で共通化リファクタ予定（タスク化済み）。
 */

/** 背景色がライトかどうかを判定（グラデーション対応、最初の #RRGGBB で判定） */
export function isLightBackground(bgColor: string): boolean {
  // グラデーションの場合は最初の色で判定
  const color = bgColor.includes('gradient')
    ? bgColor.match(/#[0-9A-Fa-f]{6}/)?.[0] || '#FAF8F4'
    : bgColor

  const hex = color.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5
}

/** コメント文字数に応じた動的フォントサイズ */
export function getCommentFontSize(
  text: string,
  mode: 'stories' | 'feed'
): number {
  const len = text.length
  if (mode === 'stories') {
    if (len <= 20) return 28
    if (len <= 40) return 24
    if (len <= 80) return 20
    if (len <= 120) return 17
    return 15
  } else {
    if (len <= 20) return 22
    if (len <= 40) return 19
    if (len <= 80) return 16
    if (len <= 120) return 14
    return 13
  }
}

/** カード形状定義 */
export const CARD_SHAPES = [
  { id: 'square', label: '🔲', borderRadius: 0, hasTail: false, hasNotch: false, hasStamp: false },
  { id: 'round', label: '🔳', borderRadius: 24, hasTail: false, hasNotch: false, hasStamp: false },
  { id: 'bubble', label: '💬', borderRadius: 24, hasTail: true, hasNotch: false, hasStamp: false },
  { id: 'ticket', label: '🏷', borderRadius: 12, hasTail: false, hasNotch: true, hasStamp: false },
  { id: 'stamp', label: '⭐', borderRadius: 0, hasTail: false, hasNotch: false, hasStamp: true },
] as const

export type CardShape = typeof CARD_SHAPES[number]
