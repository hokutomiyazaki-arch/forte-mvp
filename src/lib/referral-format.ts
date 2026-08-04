/**
 * §2-4 予約リクエスト系の共通フォーマッタ(サーバー/クライアント両方から使う純関数)。
 * 同じ整形ロジックを複数箇所に書かないための集約先。
 */

/**
 * ISO文字列を「2026年8月5日 14:00」形式に整形する。無効な値はnull。
 * サーバー(UTC)/ブラウザ(ローカルTZ)で実行環境が異なっても同一表示になるよう、
 * getFullYear()/getHours() 等の実行環境依存メソッドは使わず、常に Asia/Tokyo で整形する。
 */
export function formatSlot(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}年${get('month')}月${get('day')}日 ${get('hour')}:${get('minute')}`
}

/**
 * 逆指定(別日時の提案)・クライアントの日時選択ページで使う曜日付き整形。
 * 例: 「2026年8月5日(水) 14:00」。formatSlot同様サーバー/ブラウザ両実行環境で
 * 表示が揺れないよう常にAsia/Tokyoで整形する。
 */
export function formatSlotWithWeekday(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}年${get('month')}月${get('day')}日(${get('weekday')}) ${get('hour')}:${get('minute')}`
}

/**
 * datetime-local由来のオフセット無し文字列("2026-08-05T14:00")はUTC環境でパースすると
 * 9時間ズレる。オフセット/Zが既に付いている場合はそのまま、無い場合は Asia/Tokyo(+09:00) を
 * 明示付与してからパースする(§2-4 bookings POST・逆指定counter提案で共通利用)。
 */
export function parseSlot(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const raw = value.trim()
  const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(raw)
  const withOffset = hasOffset ? raw : `${raw}+09:00`
  const d = new Date(withOffset)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/**
 * ライフサイクル改善(タスクC): Googleカレンダー追加URL生成。所要時間は仮で60分固定。
 * `dates=` はAsia/Tokyoのローカル表記(オフセット無し)+ `ctz=Asia/Tokyo` の組み合わせで
 * 常にJSTとして解釈させる(サーバー実行環境のTZに依存しない)。
 */
export function buildGoogleCalendarUrl(params: {
  startIso: string
  title: string
  details?: string
  location?: string
  durationMinutes?: number
}): string | null {
  const start = new Date(params.startIso)
  if (Number.isNaN(start.getTime())) return null
  const durationMinutes = params.durationMinutes ?? 60
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)

  const toGoogleLocal = (d: Date): string => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
    return `${get('year')}${get('month')}${get('day')}T${get('hour')}${get('minute')}${get('second')}`
  }

  const qs = new URLSearchParams({
    action: 'TEMPLATE',
    text: params.title,
    dates: `${toGoogleLocal(start)}/${toGoogleLocal(end)}`,
    ctz: 'Asia/Tokyo',
  })
  if (params.details) qs.set('details', params.details)
  if (params.location) qs.set('location', params.location)

  return `https://calendar.google.com/calendar/render?${qs.toString()}`
}

/**
 * ライフサイクル改善(タスクB・2026-08-04・CEO指示): preferred_slotsから確定日時のISO文字列を
 * 解決する共通ロジック(受け手カード/クライアントページ/cron/決済Webhookで共有・二重実装しない)。
 * confirmed_slot_iso(日時変更承諾時に直接保存する推奨方式)を最優先し、無ければ既存の
 * confirmed_counter_index(逆指定承諾)→confirmed_index(通常確定)の順にフォールバックする。
 */
export interface PreferredSlotsShape {
  slots?: (string | null)[] | null
  confirmed_index?: number | null
  counter_slots?: (string | null)[] | null
  confirmed_counter_index?: number | null
  confirmed_slot_iso?: string | null
}

export function resolveConfirmedSlotIso(preferredSlots: PreferredSlotsShape | null | undefined): string | null {
  if (!preferredSlots) return null
  if (preferredSlots.confirmed_slot_iso) return preferredSlots.confirmed_slot_iso
  if (typeof preferredSlots.confirmed_counter_index === 'number') {
    return preferredSlots.counter_slots?.[preferredSlots.confirmed_counter_index] || null
  }
  if (typeof preferredSlots.confirmed_index === 'number') {
    return preferredSlots.slots?.[preferredSlots.confirmed_index] || null
  }
  return null
}
