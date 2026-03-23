// ===== 認定システム定数 =====

/** Lv.1: 15プルーフ以上で PROVEN（証明済み）認定 */
export const PROVEN_THRESHOLD = 15;

/** Lv.2: 30プルーフ以上で SPECIALIST 認定（賞状・カード申請可能） */
export const SPECIALIST_THRESHOLD = 30;

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
  performance: 'パフォーマンス',
  mind: 'マインド',
  discovery: '発見・気づき',
  guidance: '指導力',
  beauty: 'ビューティー',
  nutrition: '栄養・生活',
  bodymake: 'ボディメイク',
};

/** タブの表示順序 */
export const TAB_ORDER: string[] = [
  'healing',
  'body',
  'performance',
  'mind',
  'discovery',
  'guidance',
  'beauty',
  'nutrition',
  'bodymake',
];
