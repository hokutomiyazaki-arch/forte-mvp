/**
 * 発送ラベル（認定申請者向け）の共通ロジック — 純粋関数のみ。
 *
 * 対象は **認定申請者**（certification_applications テーブル）。
 * NFCカード購入者（card_orders）のラベルは別系統で扱う（このファイルの対象外）。
 *
 * ・発送元（差出人）の表記を単一ソース化。
 * ・certification_applications の住所カラムをラベル描画しやすい形に整形する。
 *
 * 画像化はクライアント側（html2canvas）で行う。任意の申請者氏名・住所を扱うため
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

export interface ParsedRecipient {
  /** 宛名（様は描画側で付与） */
  name: string
  /** 郵便番号（〒 なし・ハイフンは入力値のまま） */
  postalCode: string
  /** 住所メイン行（都道府県+市区町村+番地） */
  addressMain: string
  /** 建物名・部屋番号など。無ければ空文字 */
  addressBuilding: string
  /** 住所を1行に連結（一覧表示用） */
  oneLine: string
  /** 宛名・郵便番号・住所のいずれかが欠けているか（要目視確認の目印） */
  incomplete: boolean
}

/** certification_applications の住所関連カラム（ラベル描画に必要な分だけ） */
export interface CertApplicationAddress {
  full_name_kanji?: string | null
  postal_code?: string | null
  prefecture?: string | null
  city_address?: string | null
  building?: string | null
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * 認定申請（certification_applications の1行/1グループ）を宛先として整形する。
 * 日本の住所順（都道府県→市区町村→番地→建物）で連結。日本語住所なので区切り空白は入れない。
 */
export function recipientFromApplication(a: CertApplicationAddress): ParsedRecipient {
  const name = clean(a.full_name_kanji)
  const postalCode = clean(a.postal_code)
  const addressMain = [clean(a.prefecture), clean(a.city_address)].filter(Boolean).join('')
  const addressBuilding = clean(a.building)
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
