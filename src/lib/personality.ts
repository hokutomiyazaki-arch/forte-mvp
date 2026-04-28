// パーソナリティ刷新（カテゴリ化＋ランク進化）の共通定義
// データ保護: 集計クエリは必ず is_active = true でフィルタすること

export type PersonalityCategory = 'inner' | 'interpersonal' | 'atmosphere'

export interface PersonalityCategoryMeta {
  key: PersonalityCategory
  emoji: string
  name: string
  subtitle: string
  color: string
  colorLight: string
}

export const PERSONALITY_CATEGORIES: PersonalityCategoryMeta[] = [
  {
    key: 'inner',
    emoji: '🧠',
    name: '内面性',
    subtitle: 'この人の核として感じたもの',
    color: '#534AB7',
    colorLight: '#EEEDFE',
  },
  {
    key: 'interpersonal',
    emoji: '🤝',
    name: '対人性',
    subtitle: '関わり方として印象的だったもの',
    color: '#1D9E75',
    colorLight: '#E1F5EE',
  },
  {
    key: 'atmosphere',
    emoji: '✨',
    name: '空気感',
    subtitle: '場に流れていた空気感',
    color: '#D85A30',
    colorLight: '#FAECE7',
  },
]

export function getCategoryMeta(category: PersonalityCategory): PersonalityCategoryMeta {
  return PERSONALITY_CATEGORIES.find(c => c.key === category) || PERSONALITY_CATEGORIES[0]
}

export interface PersonalityRank {
  level: 0 | 1 | 2 | 3 | 4
  icon: string
  name: string
  nextThreshold: number | null
  votesToNext: number | null
}

export function calculateRank(categoryTotalVotes: number): PersonalityRank {
  if (categoryTotalVotes >= 300) {
    return { level: 4, icon: '👑', name: '伝説', nextThreshold: null, votesToNext: null }
  }
  if (categoryTotalVotes >= 100) {
    return { level: 3, icon: '💎', name: '輝き', nextThreshold: 300, votesToNext: 300 - categoryTotalVotes }
  }
  if (categoryTotalVotes >= 30) {
    return { level: 2, icon: '⭐', name: '確かな声', nextThreshold: 100, votesToNext: 100 - categoryTotalVotes }
  }
  if (categoryTotalVotes >= 1) {
    return { level: 1, icon: '🌱', name: '芽吹き', nextThreshold: 30, votesToNext: 30 - categoryTotalVotes }
  }
  return { level: 0, icon: '✨', name: '序章', nextThreshold: 1, votesToNext: 1 }
}

// カテゴリ別の5階調パレット（1位=最濃 → 5位=最淡）
// セグメントドーナツ・詳細バーで共通利用
export const PERSONALITY_COLOR_PALETTE: Record<PersonalityCategory, string[]> = {
  inner: ['#534AB7', '#7F77DD', '#AFA9EC', '#CECBF6', '#EEEDFE'],
  interpersonal: ['#1D9E75', '#5DCAA5', '#9FE1CB', '#D1F0E2', '#E1F5EE'],
  atmosphere: ['#D85A30', '#F0997B', '#F5C4B3', '#FADCD0', '#FAECE7'],
}

export function getCategoryPalette(category: PersonalityCategory): string[] {
  return PERSONALITY_COLOR_PALETTE[category]
}

// パレットインデックス: 0票 → null（背景）, 1〜4位 → そのインデックス, 5位以下 → 4
export function paletteIndexFor(rank: number, votes: number): number {
  if (votes <= 0) return 4
  if (rank >= 4) return 4
  return rank
}

export function isPersonalityV2(): boolean {
  return process.env.NEXT_PUBLIC_PERSONALITY_V2 === 'true'
}
