/**
 * 予約の受け方（§17-1・CEO決定 2026-08-06）の単一情報源。
 *
 * REALPROOF は自前の予約システム(/book/[proId])を持つ。一方で、既に自分のサイトや
 * 外部の予約システムを使っているプロもいる。**予約の受け口は必ず1本にする**
 * （2本あると片方を見落とし、お客さんが来ているのに気づかない＝いちばん重い事故になる）。
 *
 * 判定:
 *   booking_enabled === false → 予約導線を一切出さない（§16-29）
 *   booking_mode === 'external' → booking_url へ（未設定ならRPで受ける方に倒す）
 *   booking_mode === 'rp'       → /book/[proId]
 *   booking_mode が未選択(null) → booking_url があれば external、無ければ rp
 *     ここが既存プロの互換のかなめ。今まで自分のサイトを予約ボタンに設定していた人の
 *     挙動を、本人が選ぶまで変えない。
 *
 * import 0本のリーフに保つこと（API routeのチャンクグラフを壊さないため・CLAUDE.md §G）。
 */

export type BookingMode = 'rp' | 'external'

export interface BookingModeInput {
  id: string
  booking_url?: string | null
  booking_enabled?: boolean | null
  booking_mode?: string | null
}

export interface BookingTarget {
  /** 予約導線を出してよいか（false のときは href を使わない） */
  enabled: boolean
  mode: BookingMode
  /** 遷移先。mode='external' のときだけ外部URL */
  href: string
  /** target="_blank" を付けるべきか */
  external: boolean
}

/** booking_mode の生値を正規化する（想定外の値は「未選択」に倒す） */
export function normalizeBookingMode(value: unknown): BookingMode | null {
  return value === 'rp' || value === 'external' ? value : null
}

/**
 * このプロの予約ボタンの遷移先を決める。
 * 表示するかどうか(enabled)も同時に返すので、呼び出し側で booking_enabled を再解釈しないこと。
 */
export function resolveBookingTarget(pro: BookingModeInput): BookingTarget {
  // §16-29: カラム未作成なら null=受付中（fail-open）。false のときだけ止める。
  const enabled = pro.booking_enabled !== false
  const url = typeof pro.booking_url === 'string' && pro.booking_url.trim() ? pro.booking_url.trim() : null
  const mode = normalizeBookingMode(pro.booking_mode)

  const resolved: BookingMode = mode === 'external' ? (url ? 'external' : 'rp') : mode === 'rp' ? 'rp' : url ? 'external' : 'rp'

  if (resolved === 'external' && url) {
    return { enabled, mode: 'external', href: url, external: true }
  }
  return { enabled, mode: 'rp', href: `/book/${pro.id}`, external: false }
}

/**
 * メニューからの予約は**必ずREALPROOFで受ける**（CEO決定 2026-08-06）。
 * 外部サイトに「このメニューで」を渡す手段が無く、渡せないまま飛ばすと
 * お客さんが選んだメニューが消えるため。自分のサイトで受けたいプロは、
 * メニュー側の「このメニューで予約を受ける」(pro_menus.is_referral_bookable)を
 * 外せば導線自体が出ない。
 */
export function buildMenuBookingHref(proId: string, menuId: string): string {
  return `/book/${proId}?menu=${encodeURIComponent(menuId)}`
}
