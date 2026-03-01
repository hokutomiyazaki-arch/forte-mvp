export type ThemeKey = 'dark' | 'cream' | 'white' | 'sage' | 'blush'

export interface MyProofTheme {
  key: ThemeKey
  label: string
  selectorColor: string
  bg: string
  text: string
  subtext: string
  subtextMuted: string
  accent: string
  accentText: string
  categoryBadgeBg: string
  categoryBadgeText: string
  cardBg: string
  cardBorder: string
  divider: string
  isLight: boolean
}

export const THEMES: Record<ThemeKey, MyProofTheme> = {
  dark: {
    key: 'dark',
    label: 'ダーク',
    selectorColor: '#1A1A2E',
    bg: '#1A1A2E',
    text: '#FFFFFF',
    subtext: 'rgba(255,255,255,0.6)',
    subtextMuted: 'rgba(255,255,255,0.3)',
    accent: '#C4A35A',
    accentText: '#1A1A2E',
    categoryBadgeBg: 'rgba(255,255,255,0.1)',
    categoryBadgeText: '#C4A35A',
    cardBg: 'rgba(255,255,255,0.05)',
    cardBorder: 'rgba(196,163,90,0.15)',
    divider: 'rgba(196,163,90,0.2)',
    isLight: false,
  },
  cream: {
    key: 'cream',
    label: 'クリーム',
    selectorColor: '#FAFAF7',
    bg: '#FAFAF7',
    text: '#1A1A2E',
    subtext: 'rgba(26,26,46,0.5)',
    subtextMuted: 'rgba(26,26,46,0.25)',
    accent: '#C4A35A',
    accentText: '#FFFFFF',
    categoryBadgeBg: 'rgba(196,163,90,0.1)',
    categoryBadgeText: '#C4A35A',
    cardBg: '#FFFFFF',
    cardBorder: 'rgba(196,163,90,0.25)',
    divider: 'rgba(196,163,90,0.15)',
    isLight: true,
  },
  white: {
    key: 'white',
    label: 'ホワイト',
    selectorColor: '#FFFFFF',
    bg: '#FFFFFF',
    text: '#2D2D2D',
    subtext: 'rgba(45,45,45,0.5)',
    subtextMuted: 'rgba(45,45,45,0.2)',
    accent: '#1A1A2E',
    accentText: '#FFFFFF',
    categoryBadgeBg: 'rgba(0,0,0,0.08)',
    categoryBadgeText: '#1A1A2E',
    cardBg: '#F7F7F7',
    cardBorder: 'rgba(0,0,0,0.08)',
    divider: 'rgba(0,0,0,0.06)',
    isLight: true,
  },
  sage: {
    key: 'sage',
    label: 'セージ',
    selectorColor: '#EFF2ED',
    bg: '#EFF2ED',
    text: '#2E3A2E',
    subtext: 'rgba(46,58,46,0.55)',
    subtextMuted: 'rgba(46,58,46,0.25)',
    accent: '#6B8F6B',
    accentText: '#FFFFFF',
    categoryBadgeBg: 'rgba(107,143,107,0.1)',
    categoryBadgeText: '#6B8F6B',
    cardBg: '#FFFFFF',
    cardBorder: 'rgba(107,143,107,0.2)',
    divider: 'rgba(107,143,107,0.15)',
    isLight: true,
  },
  blush: {
    key: 'blush',
    label: 'ブラッシュ',
    selectorColor: '#F5EDED',
    bg: '#F5EDED',
    text: '#3A2E2E',
    subtext: 'rgba(58,46,46,0.55)',
    subtextMuted: 'rgba(58,46,46,0.25)',
    accent: '#B07070',
    accentText: '#FFFFFF',
    categoryBadgeBg: 'rgba(176,112,112,0.1)',
    categoryBadgeText: '#B07070',
    cardBg: '#FFFFFF',
    cardBorder: 'rgba(176,112,112,0.2)',
    divider: 'rgba(176,112,112,0.15)',
    isLight: true,
  },
}

export function getTheme(key: string | null | undefined): MyProofTheme {
  return THEMES[(key as ThemeKey)] || THEMES.dark
}

// ── カテゴリ定義 ──

export type CategoryKey = 'professional' | 'restaurant' | 'book' | 'spot' | 'product' | 'experience' | 'other'

export interface MyProofCategory {
  key: CategoryKey
  label: string
  icon: string
  color: string
}

export const CATEGORIES: MyProofCategory[] = [
  { key: 'professional', label: '本気でオススメするプロ',       icon: '👤', color: '#C4A35A' },
  { key: 'restaurant',   label: '本気でオススメするレストラン', icon: '🍽️', color: '#E07A5F' },
  { key: 'book',         label: '本気でオススメする本',         icon: '📖', color: '#5B8C5A' },
  { key: 'spot',         label: '本気でオススメするスポット',   icon: '📍', color: '#3D5A80' },
  { key: 'product',      label: '本気でオススメするモノ',       icon: '✨', color: '#9B5DE5' },
  { key: 'experience',   label: '本気でオススメする体験',       icon: '🎯', color: '#F4845F' },
  { key: 'other',        label: 'その他のオススメ',             icon: '💡', color: '#888888' },
]

export function getCategoryByKey(key: string): MyProofCategory {
  return CATEGORIES.find(c => c.key === key) || CATEGORIES[CATEGORIES.length - 1]
}

export function getCategoryShortLabel(cat: MyProofCategory): string {
  return cat.label.replace('本気でオススメする', '')
}
