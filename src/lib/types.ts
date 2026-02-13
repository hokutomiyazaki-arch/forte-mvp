export interface Professional {
  id: string
  user_id: string
  name: string
  title: string
  location: string | null
  years_experience: number | null
  bio: string | null
  photo_url: string | null
  specialties: string[] | null
  booking_url: string | null
  coupon_text: string | null
  selected_fortes: string[] | null
  custom_forte_1: string | null
  custom_forte_2: string | null
  is_founding_member: boolean
  created_at: string
  updated_at: string
}

export interface Vote {
  id: string
  professional_id: string
  category: string
  comment: string | null
  created_at: string
}

export interface VoteSummary {
  professional_id: string
  category: string
  vote_count: number
}

export const FORTE_OPTIONS: { key: string; label: string; emoji: string; desc: string }[] = [
  { key: 'skill',       label: '技術力',       emoji: '💪', desc: '施術・指導が的確で上手い' },
  { key: 'knowledge',   label: '知識',         emoji: '📚', desc: '専門的な説明や提案が深い' },
  { key: 'trust',       label: '信頼感',       emoji: '🤝', desc: '安心して身体を預けられる' },
  { key: 'passion',     label: '情熱',         emoji: '🔥', desc: '真剣に向き合ってくれる' },
  { key: 'empathy',     label: '寄り添い',     emoji: '💛', desc: '話をよく聴いてくれる・優しい' },
  { key: 'result',      label: '結果力',       emoji: '🎯', desc: '実際に身体が変わった' },
  { key: 'explanation', label: '説明力',       emoji: '💬', desc: '分かりやすく納得できる' },
  { key: 'atmosphere',  label: '雰囲気',       emoji: '✨', desc: 'リラックスできる空間や人柄' },
  { key: 'followup',    label: '継続サポート', emoji: '📋', desc: 'セルフケアや計画を一緒に考えてくれる' },
  { key: 'flexibility', label: '対応力',       emoji: '⚡', desc: '柔軟で要望に素早く応えてくれる' },
]

export function getForteLabel(key: string, pro?: Professional | null): string {
  if (key === 'custom1' && pro?.custom_forte_1) return pro.custom_forte_1
  if (key === 'custom2' && pro?.custom_forte_2) return pro.custom_forte_2
  return FORTE_OPTIONS.find(o => o.key === key)?.label || key
}

export function getForteEmoji(key: string): string {
  if (key === 'custom1') return '⭐'
  if (key === 'custom2') return '🌟'
  return FORTE_OPTIONS.find(o => o.key === key)?.emoji || '🔷'
}

export function getForteDesc(key: string): string {
  return FORTE_OPTIONS.find(o => o.key === key)?.desc || ''
}
