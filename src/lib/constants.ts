// ===== 認定システム定数 =====

/** Lv.1: 15プルーフ以上で PROVEN（証明済み）認定 */
export const PROVEN_THRESHOLD = 15;

/** Lv.2: 30プルーフ以上で SPECIALIST 認定（賞状・カード申請可能） */
export const SPECIALIST_THRESHOLD = 30;

/** Lv.3: 50プルーフ以上で MASTER 認定 */
export const MASTER_THRESHOLD = 50;

/** Lv.4: 100プルーフ以上で LEGEND 認定 */
export const LEGEND_THRESHOLD = 100;

/** Lv.5: 500プルーフ以上で IMMORTAL（項目別・表示/メダルのみ。料金/物理カードは対象外） */
export const IMMORTAL_THRESHOLD = 500;

// ===== 認定ティア判定ヘルパー =====

// IMMORTAL は「表示/メダル」ラダーにのみ存在。料金/物理(CertifiableTier)には含めない。
export type CertificationTier = 'PROVEN' | 'SPECIALIST' | 'MASTER' | 'LEGEND' | 'IMMORTAL'
/** 申請対象ティア (PROVEN/IMMORTAL は申請対象外、SPECIALIST〜LEGEND のみ) */
export type CertifiableTier = 'SPECIALIST' | 'MASTER' | 'LEGEND'

/**
 * 票数からティアを判定。閾値未満は null。
 * 優先順: IMMORTAL > LEGEND > MASTER > SPECIALIST > PROVEN
 */
export function getCertificationTier(voteCount: number): CertificationTier | null {
  if (voteCount >= IMMORTAL_THRESHOLD) return 'IMMORTAL'
  if (voteCount >= LEGEND_THRESHOLD) return 'LEGEND'
  if (voteCount >= MASTER_THRESHOLD) return 'MASTER'
  if (voteCount >= SPECIALIST_THRESHOLD) return 'SPECIALIST'
  if (voteCount >= PROVEN_THRESHOLD) return 'PROVEN'
  return null
}

/**
 * 申請対象ティア (SPECIALIST 以上) のみ返す。PROVEN / 未達は null。
 * ※ 500+(IMMORTAL相当)は料金/物理上 LEGEND 扱いに丸める（IMMORTAL は certifiable ではない）。
 *    閾値未満は null。閾値から直接判定し、getCertificationTier の IMMORTAL を漏らさない。
 */
export function getCertifiableTier(voteCount: number): CertifiableTier | null {
  if (voteCount >= LEGEND_THRESHOLD) return 'LEGEND'
  if (voteCount >= MASTER_THRESHOLD) return 'MASTER'
  if (voteCount >= SPECIALIST_THRESHOLD) return 'SPECIALIST'
  return null
}

/**
 * 次のティアと残り票数。
 * - PROVEN 未達 / PROVEN: Next = SPECIALIST (30)
 * - SPECIALIST: Next = MASTER (50)
 * - MASTER: Next = LEGEND (100)
 * - LEGEND: Next = IMMORTAL (500)
 * - IMMORTAL(500+): null (最高ティア達成)
 */
export function getNextTier(
  voteCount: number
): { tier: CertifiableTier | 'IMMORTAL'; threshold: number; remaining: number } | null {
  if (voteCount < SPECIALIST_THRESHOLD) {
    return { tier: 'SPECIALIST', threshold: SPECIALIST_THRESHOLD, remaining: SPECIALIST_THRESHOLD - voteCount }
  }
  if (voteCount < MASTER_THRESHOLD) {
    return { tier: 'MASTER', threshold: MASTER_THRESHOLD, remaining: MASTER_THRESHOLD - voteCount }
  }
  if (voteCount < LEGEND_THRESHOLD) {
    return { tier: 'LEGEND', threshold: LEGEND_THRESHOLD, remaining: LEGEND_THRESHOLD - voteCount }
  }
  if (voteCount < IMMORTAL_THRESHOLD) {
    return { tier: 'IMMORTAL', threshold: IMMORTAL_THRESHOLD, remaining: IMMORTAL_THRESHOLD - voteCount }
  }
  return null
}

/** ティア表示メタ (アイコン、ラベル) */
export const TIER_DISPLAY: Record<CertificationTier, { icon: string; label: string }> = {
  PROVEN: { icon: '🛡', label: 'PROVEN' },
  SPECIALIST: { icon: '🏆', label: 'SPECIALIST' },
  MASTER: { icon: '👑', label: 'MASTER' },
  LEGEND: { icon: '💎', label: 'LEGEND' },
  IMMORTAL: { icon: '🔥', label: 'IMMORTAL' },
}

// ===== メダル画像パス (CertifiableTier のみ) =====

/**
 * メダル画像のパス定義。
 * - og:    1200x630 の OGP 画像 (400px 角想定)
 * - large: ダッシュボード等の大表示 (200px 角)
 * - small: バッジ・リスト用 (64px 角)
 *
 * PROVEN にはメダル無し。SPECIALIST 以上のみ画像が存在する。
 */
export const MEDAL_PATHS: Record<CertifiableTier, { og: string; large: string; small: string }> = {
  SPECIALIST: {
    og: '/medals/specialist-400.png',
    large: '/medals/specialist-200.png',
    small: '/medals/specialist-64.png',
  },
  MASTER: {
    og: '/medals/master-400.png',
    large: '/medals/master-200.png',
    small: '/medals/master-64.png',
  },
  LEGEND: {
    og: '/medals/legend-400.png',
    large: '/medals/legend-200.png',
    small: '/medals/legend-64.png',
  },
} as const

/**
 * ティア → メダル画像パスのヘルパー。
 * PROVEN / 未達 / null は null を返す (メダル無し)。
 */
export function getMedalPath(
  tier: CertificationTier | null,
  size: 'og' | 'large' | 'small' = 'og'
): string | null {
  if (!tier || tier === 'PROVEN') return null
  return MEDAL_PATHS[tier][size]
}

/**
 * 認定申請の料金 + Stripe 決済リンク (CertifiableTier 別)
 *   - SPECIALIST: 初回は無料、2 回目以降の更新は ¥11,000
 *   - MASTER: 常に ¥22,000
 *   - LEGEND: 常に ¥55,000
 */
export const CERTIFICATION_PRICING: Record<CertifiableTier, {
  amount: number
  label: string
  stripeUrl: string
}> = {
  SPECIALIST: { amount: 11000, label: '¥11,000', stripeUrl: 'https://buy.stripe.com/5kQ5kE4N376mefq8dIffy0h' },
  MASTER:     { amount: 22000, label: '¥22,000', stripeUrl: 'https://buy.stripe.com/7sY5kEenD62ib3e9hMffy0i' },
  LEGEND:     { amount: 55000, label: '¥55,000', stripeUrl: 'https://buy.stripe.com/5kQ9AUbbraiy0oA2Toffy0k' },
} as const

/**
 * 認定申請の「物理プロダクト」料金（CEO確定 2026-07-02）。
 * 課金は物理プロダクト単位・一律価格で、申請カテゴリ数では変わらない（加算もしない）。
 *   - pvc   : 名入りPVCカード（Specialist以上で申請可）。**初回グループは無料**、2回目以降は課金。
 *   - metal : 金属カード（Master以上で申請可・任意オプション）。選択時のみ課金。
 *   - shield: 盾（Legend以上で申請可・任意オプション）。選択時のみ課金。
 * 金属カードと盾は独立して選択でき、両方選ぶと加算される。
 * ※ 賞状は常に「申請した認定項目の枚数分」（無料で付属）。
 */
export const CERTIFICATION_PRODUCT_PRICING = {
  pvc: 5500,
  metal: 9800,
  shield: 15500,
} as const

/** PROVEN / SPECIALIST 共通ゴールドカラー */
export const PROVEN_GOLD = '#D4A843';

/** TOP PROOF 15票以上のグラデーション背景 */
export const PROVEN_GRADIENT = 'linear-gradient(135deg, #1A1A2E, #2A1F0A)';

/** 運営メール送信先（認定申請通知用） */
export const OPS_EMAIL = process.env.OPS_NOTIFICATION_EMAIL || 'bodydiscoverystudio@gmail.com';

// ===== プルーフ項目カテゴリ表示名（効果ベース8カテゴリ） =====

/** proof_items.tab → 表示名マッピング */
export const TAB_DISPLAY_NAMES: Record<string, string> = {
  healing: '治療・回復',
  body: '体の機能改善',
  bodymake: 'ボディメイク',
  performance: 'パフォーマンス',
  mind: 'マインド',
  relax: 'リラックス',
  beauty: 'ビューティー',
  nutrition: '栄養・生活',
  skill: '指導力',
  universal: 'ユニバーサル',
};

/** タブの表示順序 */
export const TAB_ORDER: string[] = [
  'healing',
  'body',
  'bodymake',
  'performance',
  'mind',
  'relax',
  'beauty',
  'nutrition',
  'skill',
  'universal',
];

// ===== 認定メール用 英語名マッピング =====
// 認定カード/賞状制作で英語名が必要なため、proof_items.strength_label と
// personality_items.label に対する英語名を保持する。マッピングにない項目は
// 呼び出し側で日本語名にフォールバックすること。

/** proof_items.strength_label → 英語名 (90 項目) */
export const STRENGTH_ENGLISH_NAMES: Record<string, string> = {
  'エイジングケアに強い': 'Anti-Aging Expertise',
  'エネルギーレベルUP': 'Energy Level Boost',
  'くすみ・むくみ改善': 'Dullness & Swelling Relief',
  'サイズダウン': 'Size Reduction',
  'セルフケア指導': 'Self-Care Guidance',
  'パーツの変化を実感': 'Visible Body Part Transformation',
  'パフォーマンスUP': 'Performance Enhancement',
  'フォーム改善': 'Form Correction',
  'プロレベルの指導': 'Professional-Level Coaching',
  'ボディラインが変わる': 'Body Line Transformation',
  'メンタルを安定させる': 'Mental Stabilization',
  'メンタル強化': 'Mental Strengthening',
  'やる気を引き出す': 'Motivation Booster',
  'レベルに合わせた指導': 'Level-Adapted Coaching',
  '不調の根本原因を見抜く': 'Identifying Root Causes of Physical Dysfunction',
  '人生の方向性を見つける': 'Life Direction Discovery',
  '代謝が上がる': 'Metabolism Boost',
  '体への気づきを促す': 'Body Awareness Enhancement',
  '体幹を安定させる': 'Core Stabilization',
  '体組成改善': 'Body Composition Improvement',
  '体質に合った提案': 'Constitution-Based Recommendations',
  '保護者対応も丁寧': 'Considerate Parent Communication',
  '個性を活かした指導': 'Individuality-Based Coaching',
  '内側からの美を引き出す': 'Inner Beauty Enhancement',
  '内側から身体を変える': 'Transformation from Within',
  '再発しにくい身体づくり': 'Recurrence-Resistant Body Building',
  '分かり易い説明': 'Clear Explanation',
  '動きの質が変わる': 'Movement Quality Transformation',
  '即効性のある施術': 'Instant-Effect Treatment',
  '周りから気づかれる変化': 'Noticeable Change by Others',
  '呼吸が変わる': 'Breathing Transformation',
  '呼吸と動きがつながる': 'Breath-Movement Integration',
  '姿勢改善': 'Posture Correction',
  '安心安全な指導': 'Safe & Secure Guidance',
  '家でのケア方法を教える': 'Home Care Instruction',
  '左右バランスを整える': 'Bilateral Balance Correction',
  '弱点克服': 'Weakness Overcome',
  '強みを伸ばす': 'Strength Enhancement',
  '強みを見つけてくれる': 'Strength Discovery',
  '心が静かになる': 'Inner Stillness',
  '心身のバランスを整える': 'Mind-Body Balance',
  '心身のリラックス': 'Mind & Body Relaxation',
  '思考の枠を外す': 'Breaking Mental Barriers',
  '思考パターンを変える': 'Thought Pattern Transformation',
  '怪我しにくい身体づくり': 'Injury-Resistant Body Building',
  '感情を整える': 'Emotional Regulation',
  '感覚の覚醒': 'Sensory Awakening',
  '慢性的な不調の改善': 'Chronic Issue Relief',
  '手技で身体が変わる': 'Manual Therapy Transformation',
  '技術を上達させる': 'Skill Development',
  '施術のクオリティが高い': 'High-Quality Treatment',
  '日常に生きる指導力': 'Guidance That Impacts Daily Life',
  '日常動作が楽になる': 'Easier Daily Movement',
  '服が似合うようになる': 'Better-Fitting Clothes',
  '本番で結果を出す': 'Delivers Results in Competition',
  '柔軟性・可動域UP': 'Flexibility & Range of Motion',
  '栄養の知識を教えてくれる': 'Practical Nutrition Knowledge',
  '楽しく続けられる': 'Enjoyable & Sustainable',
  '正しい動きが身につく': 'Correct Movement Acquisition',
  '毎回が新発見': 'Fresh Discovery Every Session',
  '気分を安定させる': 'Mood Stabilization',
  '決断力を高める': 'Decision-Making Enhancement',
  '深層筋を目覚めさせる': 'Deep Muscle Activation',
  '無理なく続けられる食事管理': 'Sustainable Diet Management',
  '痛み改善': 'Pain Relief',
  '空間づくりがうまい': 'Excellent Space Creation',
  '筋力アップ': 'Muscle Strength Gain',
  '継続の仕組みを作る': 'Building Sustainable Habits',
  '練習メニューの設計力': 'Training Program Design',
  '考える力を育てる': 'Critical Thinking Development',
  '肌トラブル改善': 'Skin Trouble Relief',
  '肌の状態を正確に把握': 'Accurate Skin Assessment',
  '肌質改善': 'Skin Quality Improvement',
  '腸内環境改善': 'Gut Health Improvement',
  '自分に合う食事を提案': 'Personalized Diet Recommendation',
  '自分の体に自信がつく': 'Body Confidence Builder',
  '自己肯定感を高める': 'Self-Esteem Enhancement',
  '自律神経改善': 'Autonomic Nervous System Balance',
  '行動を変える': 'Behavioral Change',
  '複数の悩みに対応': 'Multi-Issue Support',
  '見た目の変化が明らか': 'Clearly Visible Transformation',
  '説明できない変化': 'Unexplainable Transformation',
  '身体のクセを見抜く': 'Movement Pattern Detection',
  '身体の使い方が変わる': 'Body Usage Transformation',
  '身体の可能性を引き出す': 'Unlocking Body Potential',
  '身体の変化のきっかけを作る': 'Catalyzing Physical Change',
  '身体の知識豊富': 'Deep Anatomical Knowledge',
  '長年の悩み解決': 'Long-Standing Issue Resolution',
  '集中力を高める': 'Focus Enhancement',
  '難症例にも対応': 'Handles Difficult Cases',
  '食と身体の関係を教える': 'Food-Body Connection Education',
};

/**
 * personality_items.label → 英語名
 * フラットUI化(2026-06)で label を形容詞化。下記「新label」を北斗が DB UPDATE する。
 * 旧labelは過去票の英訳保持のため残置（id→label 解決が旧labelに当たるケースの保険）。
 */
export const PERSONALITY_ENGLISH_NAMES: Record<string, string> = {
  // ===== タイプ制（9タイプ・2026-06）=====
  '冒険者タイプ': 'Adventurer',
  '職人タイプ': 'Craftsman',
  '情熱家タイプ': 'Passionate',
  '友達タイプ': 'Friend',
  '兄貴・姉御タイプ': 'Dependable',
  '愛情タイプ': 'Nurturing',
  'ムードメーカータイプ': 'Entertainer',
  '僧侶タイプ': 'Sage',
  '天然タイプ': 'Free Spirit',
  // ===== 旧label（形容詞化・フラットUI 2026-06・過去票用に残置）=====
  '誠実': 'Sincere',
  '情熱的': 'Passionate',
  '本気': 'Wholehearted',
  '気楽': 'Easygoing',
  '未来思考': 'Future-focused',
  '話しやすい': 'Approachable',
  '聞き上手': 'Great listener',
  '察しがいい': 'Perceptive',
  'フラット': 'Down-to-earth',
  '前向き': 'Positive',
  'テンポがいい': 'Good rhythm',
  '楽しい': 'Fun',
  '包容力がある': 'Accepting',
  '真面目': 'Earnest',
  // ===== 旧label（過去票English保持用・残置）=====
  // inner (内面性)
  '誠実で信頼できる': 'Sincere & Trustworthy',
  '情熱がある': 'Passionate',
  'この人の周りにいたいと思う': 'Magnetic Personality',
  '本気で向き合ってくれる': 'Wholeheartedly Committed',
  '未来を見据えて関わってくれる': 'Future-Focused Guidance',
  // interpersonal (対人性)
  '話しやすい雰囲気がある': 'Approachable Atmosphere',
  '話をしっかり聴いてくれる': 'Attentive Listener',
  '対等に向き合ってくれる': 'Treats You as an Equal',
  '厳しさの中に愛がある': 'Tough but Caring',
  '言わなくても気づいてくれる': 'Intuitively Perceptive',
  // atmosphere (空気感)
  '前向きにしてくれる': 'Uplifting & Positive',
  'テンポが良くて心地いい': 'Comfortable Rhythm',
  '一緒にいて楽しい': 'Fun to Be Around',
  '全部受け止めてくれる': 'Fully Accepting',
  '背筋が伸びる感覚がある': 'Inspires Discipline',
  // アーカイブ (is_active=false、過去票用)
  '裏表がない': 'Genuine & Transparent',
  '距離感がちょうどいい': 'Perfect Sense of Distance',
};
