/**
 * 会社情報の単一ソース。
 * 将来 REALPROOF 事業を別法人化する可能性に備え、会社表記をここに集約する。
 * 表記を変える際はこの1ファイルを書き換えるだけで全参照箇所に反映される。
 *
 * ※ phone は特商法上「ご請求があれば遅滞なく開示」表記とするため定数に含めない。
 *    将来 Stripe 審査等で電話番号の常時記載が必要になった時点で追加する。
 */
export const COMPANY_INFO = {
  name: '株式会社 Le grand chariot',
  representative: '宮崎 北斗',
  postalCode: '305-0817',
  address: '茨城県つくば市研究学園5丁目11-2',
  email: 'info@legrandchariot.com',
} as const
