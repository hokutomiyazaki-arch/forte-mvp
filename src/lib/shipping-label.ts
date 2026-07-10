/**
 * 発送ラベル（NFCカード注文）の共通ロジック — 純粋関数のみ。
 *
 * ・発送元（差出人）の表記を単一ソース化。
 * ・card_orders.shipping_address（Stripe shipping_details 由来の JSONB）を
 *   ラベル描画しやすい形に整形する。
 *
 * 画像化はクライアント側（html2canvas）で行う。任意の顧客氏名・住所を扱うため
 * subset フォント（public/fonts/*-subset.ttf）では豆腐になる → OS のシステムフォントで描く。
 */
import { COMPANY_INFO } from './company-info'

/** 発送元（差出人）。CEO 指示により差出人名は「REAL PROOF Certification Office」。 */
export const LABEL_SENDER = {
  office: 'REAL PROOF Certification Office',
  company: COMPANY_INFO.name,
  postalCode: COMPANY_INFO.postalCode,
  // 発送ラベルは建物名まで無いと届かない。COMPANY_INFO.address は特商法表記用で
  // 建物名を省略しているため、ラベル専用の完全住所をここに持つ（出典: Notion 会社概要）。
  address: '茨城県つくば市研究学園5丁目11-2 パークハウスけやき1-1907',
} as const

/** Stripe.Address 相当（JSONB から来る想定フィールド） */
export interface StripeAddressLike {
  postal_code?: string | null
  state?: string | null
  city?: string | null
  line1?: string | null
  line2?: string | null
  country?: string | null
}

/** Stripe shipping_details 相当 */
export interface ShippingDetailsLike {
  name?: string | null
  address?: StripeAddressLike | null
}

export interface ParsedRecipient {
  /** 宛名（様は描画側で付与） */
  name: string
  /** 郵便番号（〒 なし・ハイフンは Stripe の値のまま） */
  postalCode: string
  /** 住所メイン行（都道府県+市区町村+番地） */
  addressMain: string
  /** 建物名・部屋番号など（line2）。無ければ空文字 */
  addressBuilding: string
  /** 住所を1行に連結（一覧表示用） */
  oneLine: string
  /** 宛名・郵便番号・住所のいずれかが欠けているか（要目視確認の目印） */
  incomplete: boolean
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * card_orders.shipping_address（JSONB）を宛先として整形する。
 * 日本の住所順（都道府県→市区町村→番地→建物）で連結。日本語住所なので区切り空白は入れない。
 */
export function parseRecipient(
  raw: unknown,
  fallbackName?: string | null
): ParsedRecipient {
  const sd = (raw && typeof raw === 'object' ? raw : {}) as ShippingDetailsLike
  const a = (sd.address && typeof sd.address === 'object' ? sd.address : {}) as StripeAddressLike

  const name = clean(sd.name) || clean(fallbackName)
  const postalCode = clean(a.postal_code)
  const addressMain = [clean(a.state), clean(a.city), clean(a.line1)].filter(Boolean).join('')
  const addressBuilding = clean(a.line2)
  const oneLine = [addressMain, addressBuilding].filter(Boolean).join(' ')

  return {
    name,
    postalCode,
    addressMain,
    addressBuilding,
    oneLine,
    incomplete: !name || !postalCode || !addressMain,
  }
}
