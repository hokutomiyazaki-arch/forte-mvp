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

/**
 * CEO決定(2026-08-04・追加): クライアントの希望によるキャンセル(cancel_by_receiver・reason='client')の
 * 返金締切(日)。単一情報源(レビュー指摘・中5)。env非依存の純関数を置くファイルのため、
 * サーバー専用の`src/lib/feature-flags.ts`ではなくここに置く(クライアント側UIプレビューからも
 * そのまま安全にimportできる)。feature-flags.ts側はこの値を再輸出するだけにする。
 */
export const CLIENT_CANCEL_REFUND_DEADLINE_DAYS = 3

/**
 * 確定日時(slotIso)が「セッション開始の72時間(CLIENT_CANCEL_REFUND_DEADLINE_DAYS日)前」より
 * 前の時点かどうかを判定する(true=まだ72時間より前=全額返金対象)。baseMsは基準時刻
 * (省略時はDate.now()。重大3: クライアントから連絡を受けた日時をサーバー側で基準にする際に使う)。
 * slotIsoが解決できない場合は安全側(=true・全額返金)を返す(スロット情報欠損で
 * クライアントが損しないように)。
 */
export function isWithinClientRefundDeadline(slotIso: string | null | undefined, baseMs: number = Date.now()): boolean {
  if (!slotIso) return true
  const slotMs = new Date(slotIso).getTime()
  if (Number.isNaN(slotMs)) return true
  const deadlineMs = CLIENT_CANCEL_REFUND_DEADLINE_DAYS * 24 * 60 * 60 * 1000
  return slotMs - deadlineMs > baseMs
}

/**
 * レビュー指摘(中4・2026-08-05・単一情報源化): §2-4ステージ3(予約フィー方式)の予約フィー合計
 * bps(basis points)のフォールバック値。CLIENT_CANCEL_REFUND_DEADLINE_DAYSと同じ理由(env非依存・
 * クライアント側UIからも安全にimportできる)でこのファイルを本体とする。
 * feature-flags.ts側は既存importの後方互換のためだけに再輸出する(新規呼び出しはここから
 * 直接importすること)。3360のハードコード二重管理を解消する目的で追加(既存箇所は
 * feature-flags.ts経由の再輸出でそのまま動く)。
 */
export const REFERRAL_FEE_TOTAL_BPS = 3360

/**
 * §16-41(CEO決定 2026-08-08): クライアントへの記録依頼のプレフィル文(受け手が編集可能)。
 * 「受付中」カード(ReferralBookingReceivedCard)と「完了済み」カード(ReferralCompletedList)の
 * 両方で同じ文言を使うため、この単一情報源に置く(env非依存でクライアント側からも安全にimport可能)。
 */
/**
 * §16-41修正D(CEOフィードバック 2026-08-08・開封率設計): 件名=このメッセージそのものになるため、
 * 「件名になったとき開封したくなる」文面へ変更(旧文言は業務的すぎて開封率に寄与しなかった)。
 */
export const PROOF_REQUEST_DEFAULT_MESSAGE =
  '先日はありがとうございました。その後、お身体の調子はいかがですか？セッションで感じた変化をひとこと記録していただけると、とても励みになります。'

/**
 * ステージ4「自動送金」振込予定日の目安(CEO追加指示・2026-08-05): Stripe Transferはプラットフォーム
 * 残高から送り手のConnect口座へ即時に入るが、実際の銀行振込はStripe側の入金スケジュール
 * (日本のExpressは通常、数営業日周期)で行われるため正確な日付は取得できない。土日スキップのみの
 * 簡易計算(祝日は考慮しない)でN営業日後の日付を返す純関数。サーバー/クライアント両方から使うため
 * env非依存でこのファイルに置く(feature-flags.tsではない)。Asia/Tokyoの日付境界で判定する
 * (実行環境のTZに依存させない)。
 */
export function addBusinessDays(iso: string, businessDays: number): Date | null {
  const start = new Date(iso)
  if (Number.isNaN(start.getTime())) return null

  const jstParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(start)
  const get = (type: string) => jstParts.find((p) => p.type === type)?.value ?? '01'
  // 時刻は正午(UTC)に固定して1日ずつ進める(DST等の影響を避け、日付境界だけを見る)。
  let cursor = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')), 12, 0, 0))

  let remaining = businessDays
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    const weekday = cursor.getUTCDay() // 正午UTC固定のため日付境界のズレは発生しない
    if (weekday !== 0 && weekday !== 6) remaining--
  }
  return cursor
}

/**
 * 日時選択UX改善(2026-08-05・CEO指示・追加1/中3): 30分刻みへの正規化(拒否ではなく丸め)。
 * datetime-local互換の文字列("YYYY-MM-DDTHH:mm"の先頭部分を見る。他の形式/不正値はそのまま返す)の
 * 分を00/30へ切り上げる(秒は常に切り捨て)。クライアント(送信時の直叩き対策)とサーバー
 * (bookings POST・counter・reschedule)の両方から呼ぶ共通ロジック(二重実装しない・単一情報源)。
 * 分の切り上げで時・日・月・年をまたぐ場合があるため、文字列を「見た目のwall time」のまま
 * UTCとして解釈し加算する(実タイムゾーンには一切依存しない純粋なカレンダー演算)。
 * 中3(レビュー指摘): オフセット付き(Z|±HH:MM)の入力はこの関数の対象外(datetime-local互換形式
 * ではないため)。誤って9時間ズレる計算をしないよう丸めずそのまま返す。
 */
export function snapToHalfHourUp(value: string | null | undefined): string {
  if (typeof value !== 'string' || !value.trim()) return typeof value === 'string' ? value : ''
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) return value
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/)
  if (!match) return value
  const [, datePart, hourStr, minuteStr] = match
  const minute = Number(minuteStr)
  if (Number.isNaN(minute)) return value
  if (minute === 0 || minute === 30) return `${datePart}T${hourStr}:${minuteStr}`

  const base = new Date(`${datePart}T${hourStr}:${minuteStr}:00Z`)
  if (Number.isNaN(base.getTime())) return value
  const addMinutes = minute < 30 ? 30 - minute : 60 - minute
  const snapped = new Date(base.getTime() + addMinutes * 60 * 1000)
  const yyyy = snapped.getUTCFullYear()
  const mm = String(snapped.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(snapped.getUTCDate()).padStart(2, '0')
  const hh = String(snapped.getUTCHours()).padStart(2, '0')
  const mi = String(snapped.getUTCMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

const WEEKDAY_SHORT_TO_SUN0: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/**
 * 週+曜日ピッカー(2026-08-05・CEO指示・設計variantB共通基盤): 今日(Asia/Tokyo)の日付パーツと
 * 「月曜=0」形式の曜日インデックスを返す(週の起点は月曜)。
 */
function jstTodayDateParts(): { year: number; month: number; day: number; weekdayMon0: number } {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const sun0 = WEEKDAY_SHORT_TO_SUN0[get('weekday')] ?? 0
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), weekdayMon0: (sun0 + 6) % 7 }
}

/**
 * base(年月日)からdays日後の日付パーツを返す(純粋なカレンダー演算・実TZに依存しない)。
 * addBusinessDaysと同じ「正午UTC固定」の作法(DST等の影響を避け、日付境界だけを見る)。
 */
function addDaysToDateParts(base: { year: number; month: number; day: number }, days: number) {
  const d = new Date(Date.UTC(base.year, base.month - 1, base.day, 12, 0, 0))
  d.setUTCDate(d.getUTCDate() + days)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

function formatDateParts(p: { year: number; month: number; day: number }): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** 週+曜日ピッカーの曜日ボタン定義(月曜始まり)。weekdayMon0: 0=月...6=日。 */
export interface WeekdayQuickOption {
  label: string
  weekdayMon0: number
}
export const WEEKDAY_QUICK_OPTIONS: WeekdayQuickOption[] = [
  { label: '月', weekdayMon0: 0 },
  { label: '火', weekdayMon0: 1 },
  { label: '水', weekdayMon0: 2 },
  { label: '木', weekdayMon0: 3 },
  { label: '金', weekdayMon0: 4 },
  { label: '土', weekdayMon0: 5 },
  { label: '日', weekdayMon0: 6 },
]

/** 週セグメント: 0=今週,1=来週,2=2週間後。 */
export type WeekQuickSegment = 0 | 1 | 2

/**
 * 日時ピッカー設計最終版(2026-08-05・CEO指示・datetime-local廃止): datetime-localのAndroid崩壊
 * (step無視で年・分ホイールが出る)を受け、日付は自前の週+曜日ボタン、時刻は`<select>`に分離する。
 * この関数は「日付のみ」を返す("YYYY-MM-DD")。時刻は呼び出し元(SlotPicker)が別途組み立てる。
 * 「今週」で今日より前の曜日を選ばせない制御はUI側(isPastWeekdayInCurrentWeek)が担当する。
 */
export function buildQuickWeekdayDate(weekOffset: WeekQuickSegment, weekdayMon0: number): string {
  const today = jstTodayDateParts()
  const offsetDaysFromToday = -today.weekdayMon0 + weekOffset * 7 + weekdayMon0
  return formatDateParts(addDaysToDateParts(today, offsetDaysFromToday))
}

/** 「今週」セグメントで、指定曜日(weekdayMon0)が今日より前かどうか(true=UI側でdisabled)。 */
export function isPastWeekdayInCurrentWeek(weekdayMon0: number): boolean {
  return weekdayMon0 < jstTodayDateParts().weekdayMon0
}

/** "YYYY-MM-DD"文字列を正午UTC固定のDateに変換する(純粋なカレンダー演算・実TZに依存しない)。 */
function dateValueToNoonUtcDate(dateValue: string): Date | null {
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const [, y, m, d] = match
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12, 0, 0))
}

/**
 * 段階表示ピッカー(2026-08-05・CEO指示): 週選択ボタンに併記する日付範囲「8/4〜8/10」
 * (weekOffsetの月曜〜日曜・Asia/Tokyo)。formatMonthDayは本ファイル後方で定義されるが、
 * function宣言のホイスティングにより本関数からの呼び出しは問題ない。
 */
export function formatWeekRangeLabel(weekOffset: WeekQuickSegment): string {
  const mondayLabel = formatMonthDay(dateValueToNoonUtcDate(buildQuickWeekdayDate(weekOffset, 0))) || ''
  const sundayLabel = formatMonthDay(dateValueToNoonUtcDate(buildQuickWeekdayDate(weekOffset, 6))) || ''
  return `${mondayLabel}〜${sundayLabel}`
}

/** 段階表示ピッカー(2026-08-05・CEO指示): 曜日ボタンに併記する日付「8/4」。 */
export function formatDateValueAsMonthDay(dateValue: string): string {
  return formatMonthDay(dateValueToNoonUtcDate(dateValue)) || ''
}

/** 段階表示ピッカー(2026-08-05・CEO指示): 選択中の日付見出し「8月7日(金)」。 */
export function formatDateValueWithWeekday(dateValue: string): string {
  const d = dateValueToNoonUtcDate(dateValue)
  if (!d) return ''
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('month')}月${get('day')}日(${get('weekday')})`
}

/** 指定曜日(weekdayMon0)が「今日」と同じ曜日かどうか(軽微6: 当日ボタンの特別扱いに使う)。 */
export function isTodayWeekday(weekdayMon0: number): boolean {
  return weekdayMon0 === jstTodayDateParts().weekdayMon0
}

/** 今日(Asia/Tokyo)の日付を"YYYY-MM-DD"で返す(手動日付入力<input type="date">のmin属性用)。 */
export function jstTodayDateValue(): string {
  return formatDateParts(jstTodayDateParts())
}

/** dateValue("YYYY-MM-DD")が「今日(Asia/Tokyo)」と一致するかどうか。 */
export function isTodayDateValue(dateValue: string): boolean {
  return dateValue === jstTodayDateValue()
}

/**
 * 軽微6(レビュー指摘): 現在時刻(Asia/Tokyo)の「時:分」パーツ。
 */
function jstNowTimeParts(): { hour: number; minute: number } {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return { hour: Number(get('hour')), minute: Number(get('minute')) }
}

/**
 * 軽微6(レビュー指摘): 今日(Asia/Tokyo)にまだ選べる30分枠が残っているか(23:30が最後の枠。
 * 23:30以降=次の境界は翌日0:00になるため残り枠なし)。「今週」の当日ボタンのdisabled判定に使う。
 */
export function hasRemainingHalfHourSlotToday(): boolean {
  const { hour, minute } = jstNowTimeParts()
  return hour * 60 + minute < 23 * 60 + 30
}

/**
 * 軽微6(レビュー指摘): 現在時刻(Asia/Tokyo)から見た「次の30分枠」を"HH:mm"で返す(ceil・秒は無視)。
 * 23:30を超える場合は23:30に丸める(呼び出し元はhasRemainingHalfHourSlotTodayと組み合わせて
 * 「今日はもう選べない」を判定すること)。当日選択時の時刻オプション絞り込みに使う。
 */
export function jstNextHalfHourTime(): string {
  const { hour, minute } = jstNowTimeParts()
  let totalMinutes = hour * 60 + minute
  const remainder = totalMinutes % 30
  if (remainder !== 0) totalMinutes += 30 - remainder
  totalMinutes = Math.min(totalMinutes, 23 * 60 + 30)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * 日時ピッカー設計最終版(2026-08-05・CEO指示): 時刻の選択肢("HH:mm"・30分刻み)を
 * [startTime, endTime) の半開区間で生成する(startTimeを含み、endTimeは含まない)。
 * クライアント相談フォーム: buildHalfHourTimeOptions(business_hours.start||'07:00', business_hours.end||'22:00')
 *   → 終了時刻の30分前まで選べる("endの30分前まで"というCEO指示に合致)。
 * プロ側counter/reschedule: buildHalfHourTimeOptions('06:00', '24:00')
 *   → '24:00'を排他的な上限にすることで23:30(当日最後の枠)まで含む「06:00〜23:30の全域」を表現する。
 */
export function buildHalfHourTimeOptions(startTime: string, endTime: string): string[] {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return []
  const startMinutes = sh * 60 + sm
  const endMinutes = eh * 60 + em
  const out: string[] = []
  for (let t = startMinutes; t < endMinutes; t += 30) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
  }
  return out
}

/**
 * プロの受付時間(2026-08-05・CEO指示・追加3): professionals.business_hoursの形。
 * {"start":"10:00","end":"20:00","closed_days":["wed","sun"]}。すべて任意(null許容)。
 * closed_daysは英語3文字の小文字曜日コード(mon/tue/wed/thu/fri/sat/sun)。
 */
export interface BusinessHours {
  start?: string | null
  end?: string | null
  closed_days?: string[] | null
}

const DAY_CODE_BY_MON0: readonly string[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABEL_BY_CODE: Record<string, string> = {
  mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土', sun: '日',
}

/** datetime-local文字列("YYYY-MM-DDTHH:mm"の先頭部分)から月曜=0形式の曜日インデックスを返す。無効値はnull。 */
function weekdayMon0FromDatetimeLocalValue(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!match) return null
  const [, y, m, d] = match
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12, 0, 0))
  if (Number.isNaN(dt.getTime())) return null
  return (dt.getUTCDay() + 6) % 7
}

/**
 * 受付時間の表示テキスト(2026-08-05・CEO指示・追加3): 「10:00〜20:00（定休: 水・日）」形式。
 * start/end/closed_daysが全て未設定ならnull(呼び出し元は非表示にする)。
 */
export function formatBusinessHoursText(businessHours: BusinessHours | null | undefined): string | null {
  if (!businessHours) return null
  const { start, end, closed_days } = businessHours
  const hasClosedDays = Array.isArray(closed_days) && closed_days.length > 0
  if (!start && !end && !hasClosedDays) return null
  const rangeText = start && end ? `${start}〜${end}` : start ? `${start}〜` : end ? `〜${end}` : ''
  const closedText = hasClosedDays
    ? `（定休: ${(closed_days as string[]).map((c) => DAY_LABEL_BY_CODE[c] || c).join('・')}）`
    : ''
  const text = `${rangeText}${closedText}`.trim()
  return text || null
}

/**
 * 選択した希望日時が受付時間外/定休日かどうかを判定する(2026-08-05・CEO指示・追加3)。
 * ブロックはしない(警告表示のみ・CEO決定)。businessHours未設定/値が無効な場合はfalse
 * (fail-soft・警告を誤って出さない側に倒す)。
 */
export function isOutsideBusinessHours(
  datetimeLocalValue: string | null | undefined,
  businessHours: BusinessHours | null | undefined
): boolean {
  if (!businessHours || typeof datetimeLocalValue !== 'string') return false
  const match = datetimeLocalValue.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/)
  if (!match) return false
  const weekdayMon0 = weekdayMon0FromDatetimeLocalValue(datetimeLocalValue)
  if (weekdayMon0 === null) return false
  const dayCode = DAY_CODE_BY_MON0[weekdayMon0]
  if (Array.isArray(businessHours.closed_days) && businessHours.closed_days.includes(dayCode)) return true

  const [, hh, mi] = match
  const timeMinutes = Number(hh) * 60 + Number(mi)
  if (businessHours.start) {
    const [sh, sm] = businessHours.start.split(':').map(Number)
    if (!Number.isNaN(sh) && !Number.isNaN(sm) && timeMinutes < sh * 60 + sm) return true
  }
  if (businessHours.end) {
    const [eh, em] = businessHours.end.split(':').map(Number)
    if (!Number.isNaN(eh) && !Number.isNaN(em) && timeMinutes >= eh * 60 + em) return true
  }
  return false
}

/**
 * 日時選択UX改善(2026-08-05・CEO指示): datetime-local由来の値(またはISO)が「既に過去」かどうかを
 * 判定する(クライアント相談フォームの送信時バリデーション用)。値が無い/不正な場合はfalse
 * (未入力チェックは別のロジックが担当するため、ここでは過去判定のみに専念する)。
 */
export function isPastDatetimeLocalValue(value: string | null | undefined): boolean {
  const iso = parseSlot(value)
  if (!iso) return false
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return false
  return ms <= Date.now()
}

/**
 * 日時選択UX改善(2026-08-05・CEO指示): 選択した希望日時が「今からhours時間以内」かどうかを判定する
 * (プロの確定期限=48時間に対する事前警告表示用。ブロックはしない・警告のみ)。
 * 判定はクライアント側のみで良い(CEO決定)ため、この関数はサーバーからは呼ばない。
 */
export function isWithinHoursFromNow(datetimeLocalValue: string | null | undefined, hours: number): boolean {
  const iso = parseSlot(datetimeLocalValue)
  if (!iso) return false
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return false
  const diffMs = ms - Date.now()
  // 既に過去の日時は別のバリデーション(isPastDatetimeLocalValue)が担当するため、ここでは
  // 「未来だが確定期限に近い」場合のみtrue(過去日時で警告文が二重に出るのを防ぐ)。
  return diffMs > 0 && diffMs < hours * 60 * 60 * 1000
}

/** dateを「M/D」形式(Asia/Tokyo)に整形する。無効な入力はnull。 */
export function formatMonthDay(date: Date | null): string | null {
  if (!date || Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('month')}/${get('day')}`
}

/** 送金完了(paid_at)からの「口座への反映予定」目安の営業日数。土日スキップのみ(祝日考慮なし)。 */
export const REFERRAL_PAYOUT_REFLECTION_BUSINESS_DAYS = 5

/**
 * paid_at(送金完了時刻)から「口座への反映予定」目安を「M/D」形式で返す。paidAtIsoが無い/無効な場合、
 * または算出した目安日時が既に過去(レビュー指摘・軽微8: 古いpaid_at行を一覧表示する際、
 * 過ぎた日付の「予定」を出し続けると誤解を招くため)の場合はnull
 * (呼び出し元は「(目安)」の注記も含めて表示すること。この関数自体は「M/D」のみを返す)。
 */
export function estimateReferralPayoutReflectionText(paidAtIso: string | null | undefined): string | null {
  if (!paidAtIso) return null
  const estimated = addBusinessDays(paidAtIso, REFERRAL_PAYOUT_REFLECTION_BUSINESS_DAYS)
  if (!estimated || estimated.getTime() < Date.now()) return null
  return formatMonthDay(estimated)
}

/**
 * E-2(CEO決定・2026-08-06): 紹介報酬の自動送金は「完了→即送金」から「完了→保留N日→送金」に変更した。
 * 完了後のクレーム・返金要求に対する回収手段がないための保留期間。DBマイグレーションは行わず、
 * referral_payouts.created_at(=完了確定時に作成される分配行の作成時刻)からの経過日数で判定する
 * (cron/expire-referral-bookings の pending 再試行ブロックが、このN日を過ぎたpending行のみを送金対象にする)。
 */
export const PAYOUT_HOLD_DAYS = 7

/**
 * referral_payouts.created_at(分配行の作成時刻=完了確定時)から PAYOUT_HOLD_DAYS 日後の
 * 送金予定日を「M/D」形式で返す(送り手向け「◯月◯日 送金予定」表示用)。無効な入力はnull。
 * すでに保留期間を過ぎている(=送金待ち中/cronの次回実行待ち)場合も、送金予定日はそのまま返す
 * (過去日付になっても「そろそろ送金される」という情報として表示価値がある。paid_at反映予定
 * (estimateReferralPayoutReflectionText)とは異なり、ここでは過去日フィルタは行わない)。
 */
export function estimateReferralPayoutHoldExpiryText(createdAtIso: string | null | undefined): string | null {
  if (!createdAtIso) return null
  const createdMs = new Date(createdAtIso).getTime()
  if (Number.isNaN(createdMs)) return null
  const expiryMs = createdMs + PAYOUT_HOLD_DAYS * 24 * 60 * 60 * 1000
  return formatMonthDay(new Date(expiryMs))
}
