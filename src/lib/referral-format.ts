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
