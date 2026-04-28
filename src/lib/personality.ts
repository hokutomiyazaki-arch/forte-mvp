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
  if (categoryTotalVotes >= 100) {
    return { level: 4, icon: '👑', name: '伝説', nextThreshold: null, votesToNext: null }
  }
  if (categoryTotalVotes >= 30) {
    return { level: 3, icon: '💎', name: '輝き', nextThreshold: 100, votesToNext: 100 - categoryTotalVotes }
  }
  if (categoryTotalVotes >= 10) {
    return { level: 2, icon: '⭐', name: '確かな声', nextThreshold: 30, votesToNext: 30 - categoryTotalVotes }
  }
  if (categoryTotalVotes >= 1) {
    return { level: 1, icon: '🌱', name: '芽吹き', nextThreshold: 10, votesToNext: 10 - categoryTotalVotes }
  }
  return { level: 0, icon: '✨', name: '序章', nextThreshold: 1, votesToNext: 1 }
}

export function isPersonalityV2(): boolean {
  return process.env.NEXT_PUBLIC_PERSONALITY_V2 === 'true'
}
