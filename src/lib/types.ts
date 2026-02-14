// ============================================
// FORTE MVP v6 - Type Definitions
// ============================================

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
  custom_fortes: CustomForte[]
  is_founding_member: boolean
  badges: Badge[]
  created_at: string
  updated_at: string
}

export interface CustomForte {
  id: string
  label: string
  description?: string
}

export interface Badge {
  id: string
  label: string
  image_url: string
}

export interface Client {
  id: string
  user_id: string
  nickname: string
  created_at: string
}

export interface Vote {
  id: string
  professional_id: string
  client_user_id: string
  result_category: string
  personality_vote: boolean
  comment: string | null
  qr_token: string | null
  created_at: string
}

export interface VoteSummary {
  professional_id: string
  category: string
  vote_count: number
}

export interface QrToken {
  id: string
  professional_id: string
  token: string
  expires_at: string
  created_at: string
}

export interface ForteCategory {
  id: string
  parent_id: string | null
  category_type: 'result' | 'personality'
  label: string
  description: string | null
  sort_order: number
}

// ============================================
// 結果フォルテ（8項目）
// ============================================
export const RESULT_FORTES: { key: string; label: string; desc: string }[] = [
  { key: 'pain',          label: '痛みが改善した',             desc: '腰痛、肩こり、膝痛などが減った・なくなった' },
  { key: 'movement',      label: '動きが変わった',             desc: '可動域が広がった、身体の使い方が変わった' },
  { key: 'posture',       label: '姿勢が変わった',             desc: '姿勢や見た目が改善した' },
  { key: 'performance',   label: 'パフォーマンスが上がった',   desc: '競技成績や日常動作が向上した' },
  { key: 'chronic',       label: '長年の悩みが解決した',       desc: '他では解決しなかったことが変わった' },
  { key: 'maintenance',   label: '予防・メンテナンスに役立つ', desc: '不調が出にくくなった、維持できている' },
  { key: 'understanding', label: '身体への理解が深まった',     desc: '自分の身体の仕組みや原因が分かった' },
  { key: 'mental',        label: 'メンタルの不調が改善した',   desc: '睡眠・自律神経・ストレス・気分の改善' },
]

export const PERSONALITY_FORTE = {
  key: 'trust',
  label: '信頼できる人柄',
  desc: '誠実で、安心して身体を預けられると感じた',
}

export function getResultForteLabel(key: string, pro?: Professional | null): string {
  if (key.startsWith('custom_') && pro?.custom_fortes) {
    const custom = pro.custom_fortes.find(c => c.id === key)
    if (custom) return custom.label
  }
  return RESULT_FORTES.find(o => o.key === key)?.label || key
}

export function getResultForteDesc(key: string, pro?: Professional | null): string {
  if (key.startsWith('custom_') && pro?.custom_fortes) {
    const custom = pro.custom_fortes.find(c => c.id === key)
    if (custom?.description) return custom.description
  }
  return RESULT_FORTES.find(o => o.key === key)?.desc || ''
}

export function getAllForteOptions(pro?: Professional | null): { key: string; label: string; desc: string }[] {
  const options = [...RESULT_FORTES]
  if (pro?.custom_fortes) {
    pro.custom_fortes.forEach(c => {
      options.push({ key: c.id, label: c.label, desc: c.description || '' })
    })
  }
  return options
}
