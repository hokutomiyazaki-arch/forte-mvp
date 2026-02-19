// ============================================
// FORTE MVP v7 - Type Definitions
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
  contact_email: string | null
  custom_result_fortes: CustomForte[]
  custom_personality_fortes: CustomForte[]
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
  personality_categories: string[]
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

// ============================================
// 結果フォルテ（デフォルト7項目 + プロ独自最大3 = 最大10）
// ============================================
export const RESULT_FORTES: { key: string; label: string; desc: string }[] = [
  { key: 'pain',          label: '痛みが改善した',             desc: '腰痛、肩こり、膝痛などが減った・なくなった' },
  { key: 'movement',      label: '動きが変わった',             desc: '可動域が広がった、身体の使い方が変わった' },
  { key: 'posture',       label: '姿勢が変わった',             desc: '姿勢や見た目が改善した' },
  { key: 'performance',   label: 'パフォーマンスが上がった',   desc: '競技成績や日常動作が向上した' },
  { key: 'chronic',       label: '長年の悩みが解決した',       desc: '他では解決しなかったことが変わった' },
  { key: 'maintenance',   label: '予防・メンテナンスに役立つ', desc: '不調が出にくくなった、維持できている' },
  { key: 'understanding', label: '身体への理解が深まった',     desc: '自分の身体の仕組みや原因が分かった' },
]

// ============================================
// 人柄フォルテ（デフォルト7項目 + プロ独自最大3 = 最大10）
// ============================================
export const PERSONALITY_FORTES: { key: string; label: string; desc: string }[] = [
  { key: 'trustworthy',    label: '安心して任せられる',         desc: '誠実で、身体を預けても大丈夫だと感じた' },
  { key: 'approachable',   label: '話しやすい',                 desc: '気軽に相談でき、距離感がちょうどいい' },
  { key: 'passionate',     label: '情熱がある',                 desc: '仕事への熱量や向上心を感じた' },
  { key: 'attentive',      label: 'よく見てくれる',             desc: '細かい変化に気づき、一人ひとりに合わせてくれる' },
  { key: 'clear_explainer',label: '説明がわかりやすい',         desc: '専門的なことも噛み砕いて教えてくれる' },
  { key: 'good_listener',  label: '話をしっかり聴いてくれる',   desc: '悩みや要望を丁寧に受け止めてくれる' },
  { key: 'encouraging',    label: '前向きにしてくれる',         desc: '励ましやポジティブなエネルギーをもらえた' },
]

// ============================================
// リワードタイプ
// ============================================
export const REWARD_TYPES = [
  { id: 'coupon',    label: '次回特典',           description: '延長15分無料、オプション無料追加など', hasTitle: false },
  { id: 'secret',    label: 'プロの秘密',         description: 'あなただけが知っている専門知識やテクニック', hasTitle: false },
  { id: 'selfcare',  label: '自宅でできる○○',    description: 'セルフケア・セルフワークを教える', hasTitle: true },
  { id: 'book',      label: 'おすすめの一冊',     description: 'あなたの人生を変えた本', hasTitle: false },
  { id: 'spot',      label: 'おすすめスポット',   description: 'あなたの行きつけ', hasTitle: false },
  { id: 'media',     label: 'おすすめ作品',       description: '映画・音楽・Podcast', hasTitle: false },
  { id: 'surprise',  label: 'シークレット',       description: '種類すら非公開！何が出るかお楽しみ', hasTitle: false },
  { id: 'freeform',  label: '自由記入',           description: '何でもOK。タイトルと内容を自由に設定', hasTitle: true },
] as const

export function getRewardLabel(rewardType: string): string {
  return REWARD_TYPES.find(r => r.id === rewardType)?.label || rewardType
}

export function getRewardType(id: string) {
  return REWARD_TYPES.find(r => r.id === id)
}

// ============================================
// ヘルパー関数
// ============================================

export function getResultForteLabel(key: string, pro?: Professional | null): string {
  if (key.startsWith('cr_') && pro?.custom_result_fortes) {
    const custom = pro.custom_result_fortes.find(c => c.id === key)
    if (custom) return custom.label
  }
  return RESULT_FORTES.find(o => o.key === key)?.label || key
}

export function getPersonalityForteLabel(key: string, pro?: Professional | null): string {
  if (key.startsWith('cp_') && pro?.custom_personality_fortes) {
    const custom = pro.custom_personality_fortes.find(c => c.id === key)
    if (custom) return custom.label
  }
  return PERSONALITY_FORTES.find(o => o.key === key)?.label || key
}

export function getAllResultOptions(pro?: Professional | null): { key: string; label: string; desc: string }[] {
  const options = [...RESULT_FORTES]
  if (pro?.custom_result_fortes) {
    pro.custom_result_fortes.forEach(c => {
      options.push({ key: c.id, label: c.label, desc: c.description || '' })
    })
  }
  return options
}

export function getAllPersonalityOptions(pro?: Professional | null): { key: string; label: string; desc: string }[] {
  const options = [...PERSONALITY_FORTES]
  if (pro?.custom_personality_fortes) {
    pro.custom_personality_fortes.forEach(c => {
      options.push({ key: c.id, label: c.label, desc: c.description || '' })
    })
  }
  return options
}
