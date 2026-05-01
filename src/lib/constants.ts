// ===== 認定システム定数 =====

/** Lv.1: 15プルーフ以上で PROVEN（証明済み）認定 */
export const PROVEN_THRESHOLD = 15;

/** Lv.2: 30プルーフ以上で SPECIALIST 認定（賞状・カード申請可能） */
export const SPECIALIST_THRESHOLD = 30;

/** Lv.3: 50プルーフ以上で MASTER 認定（将来用、人柄ティアで使用） */
export const MASTER_THRESHOLD = 50;

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

/** personality_items.label → 英語名 (17 項目、うち末尾2つはアーカイブ) */
export const PERSONALITY_ENGLISH_NAMES: Record<string, string> = {
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
