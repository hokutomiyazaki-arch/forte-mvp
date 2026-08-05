'use client'

/**
 * 日時ピッカー設計最終版(2026-08-05・CEO指示): datetime-localをAndroidのOSピッカーが
 * step属性を無視して年・分ホイールを出す問題(実機確認済み)を受け、datetime-localを廃止し、
 * 自前の「日付(週+曜日ボタン or 手動<input type="date">) + 時刻(<select>・30分刻み)」に置換する。
 *
 * 段階表示(2026-08-05・CEO追加指示): 一度に全部出さず、選択に応じて次の段を出す。常に実際の
 * 日付を併記する。
 *   1. 週選択(最初はこれだけ表示・日付範囲併記「今週 8/4〜8/10」)
 *   2. 週を選ぶと曜日ボタンが出現(見出し「選択中: 8/4〜8/10」・曜日にも日付併記「月 8/4」)
 *   3. 曜日を選ぶと時刻セレクトが出現(見出し「選択中: 8月7日(金)」)
 *   4. 時刻まで選ぶと完了表示「8月7日(金) 10:00」+「変更」リンク(ステップ1に戻る・値は保持)
 *   5. 「別の日付を選ぶ」リンクは週選択の段。date input選択後はステップ3の時刻へ直行。
 *   6. 第2・第3希望の「選択を解除」は完了表示の横。
 *
 * クライアント相談フォーム(ReferralRequestForm)3枠・プロ側counter/reschedule
 * (ReferralBookingReceivedCard)で共通利用する(重複実装しない)。
 * 内部で保持する値は既存互換の"YYYY-MM-DDTHH:mm"文字列(datetime-local互換形式)。
 * 送信ロジック・parseSlot・サーバー側の正規化/検証(snapToHalfHourUp等)は変更不要。
 */

import { useState } from 'react'
import {
  buildQuickWeekdayDate,
  isPastWeekdayInCurrentWeek,
  isTodayWeekday,
  hasRemainingHalfHourSlotToday,
  jstNextHalfHourTime,
  jstTodayDateValue,
  isTodayDateValue,
  formatWeekRangeLabel,
  formatDateValueAsMonthDay,
  formatDateValueWithWeekday,
  WEEKDAY_QUICK_OPTIONS,
  type WeekQuickSegment,
} from '@/lib/referral-format'

interface Props {
  /** "YYYY-MM-DDTHH:mm"形式(datetime-local互換)。未選択は''。 */
  value: string
  onChange: (next: string) => void
  /** 時刻の選択肢("HH:mm"の配列・呼び出し元がbuildHalfHourTimeOptionsで生成)。 */
  timeOptions: string[]
  /** 任意枠(第2・第3希望)は「選択を解除」リンクを出す。 */
  clearable?: boolean
}

type Phase = 'week' | 'weekday' | 'time' | 'done'

const SEGMENT_OPTIONS: Array<{ label: string; weekOffset: WeekQuickSegment }> = [
  { label: '今週', weekOffset: 0 },
  { label: '来週', weekOffset: 1 },
  { label: '2週間後', weekOffset: 2 },
]

const linkStyle = {
  background: 'none',
  border: 'none',
  color: '#6B7280',
  fontSize: 13,
  textDecoration: 'underline',
  cursor: 'pointer' as const,
  padding: 0,
}

export default function SlotPicker({ value, onChange, timeOptions, clearable }: Props) {
  // 初回マウント時、既に値がある場合は完了表示から始める(値はこのコンポーネント自身の
  // onChange経由でのみ変わるため、外部からの再同期は不要)。
  const [phase, setPhase] = useState<Phase>(value ? 'done' : 'week')
  const [segment, setSegment] = useState<WeekQuickSegment>(0)
  // 週選択→曜日選択(または手動日付)で確定した「日付のみ」。時刻選択が完了するとvalueへ反映される。
  const [pendingDate, setPendingDate] = useState<string>(value ? value.split('T')[0] || '' : '')
  const [manualDateOpen, setManualDateOpen] = useState(false)

  const currentDate = value ? value.split('T')[0] || '' : ''
  const currentTime = value ? value.split('T')[1] || '' : ''

  function pickWeekday(dateForOption: string) {
    setPendingDate(dateForOption)
    setPhase('time')
  }

  function pickManualDate(nextDate: string) {
    if (!nextDate) return
    setPendingDate(nextDate)
    setPhase('time')
  }

  function pickTime(nextTime: string) {
    if (!nextTime) return
    onChange(`${pendingDate}T${nextTime}`)
    setPhase('done')
  }

  function startOver() {
    setPhase('week')
    setManualDateOpen(false)
  }

  const timeOptionsForPendingDate = pendingDate && isTodayDateValue(pendingDate)
    ? timeOptions.filter((t) => t >= jstNextHalfHourTime())
    : timeOptions
  // <select>の現在値は、pendingDateがvalueの日付と一致する場合のみ既存時刻を反映する
  // (異なる日付を選び直した直後は未選択に戻す)。
  const timeSelectValue = pendingDate && pendingDate === currentDate ? currentTime : ''

  return (
    <div style={{ marginBottom: 6 }}>
      {/* ステップ4: 完了表示 */}
      {phase === 'done' && value && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
          <div
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              background: '#FAF3E4',
              border: '1px solid #C4A35A',
              color: '#8A6D1F',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {formatDateValueWithWeekday(currentDate)} {currentTime}
          </div>
          <button type="button" onClick={startOver} style={linkStyle}>
            変更
          </button>
          {clearable && (
            <button
              type="button"
              onClick={() => {
                onChange('')
                startOver()
              }}
              style={{ ...linkStyle, color: '#9CA3AF' }}
            >
              選択を解除
            </button>
          )}
        </div>
      )}

      {/* ステップ1: 週選択(+別の日付を選ぶ) */}
      {phase === 'week' && (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' as const }}>
            {SEGMENT_OPTIONS.map((opt) => (
              <button
                key={opt.weekOffset}
                type="button"
                onClick={() => {
                  setSegment(opt.weekOffset)
                  setPhase('weekday')
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #D1D5DB',
                  background: '#fff',
                  color: '#2D2D2D',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {opt.label} {formatWeekRangeLabel(opt.weekOffset)}
              </button>
            ))}
          </div>
          {!manualDateOpen ? (
            <button type="button" onClick={() => setManualDateOpen(true)} style={linkStyle}>
              別の日付を選ぶ
            </button>
          ) : (
            <input
              type="date"
              min={jstTodayDateValue()}
              value={pendingDate}
              onChange={(e) => pickManualDate(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB',
                fontSize: 13, boxSizing: 'border-box' as const,
              }}
            />
          )}
        </div>
      )}

      {/* ステップ2: 曜日選択 */}
      {phase === 'weekday' && (
        <div>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 6 }}>
            選択中: {formatWeekRangeLabel(segment)}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
            {WEEKDAY_QUICK_OPTIONS.map((opt) => {
              const dateForOption = buildQuickWeekdayDate(segment, opt.weekdayMon0)
              const disabled =
                segment === 0 &&
                (isPastWeekdayInCurrentWeek(opt.weekdayMon0) ||
                  (isTodayWeekday(opt.weekdayMon0) && !hasRemainingHalfHourSlotToday()))
              return (
                <button
                  key={opt.weekdayMon0}
                  type="button"
                  disabled={disabled}
                  onClick={() => pickWeekday(dateForOption)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 8,
                    border: '1px solid #D1D5DB',
                    background: disabled ? '#F3F4F6' : '#fff',
                    color: disabled ? '#C0C4CB' : '#555555',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap' as const,
                  }}
                >
                  {opt.label} {formatDateValueAsMonthDay(dateForOption)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ステップ3: 時刻選択 */}
      {phase === 'time' && (
        <div>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 6 }}>
            選択中: {formatDateValueWithWeekday(pendingDate)}
          </div>
          <select
            value={timeSelectValue}
            onChange={(e) => pickTime(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB',
              fontSize: 13, boxSizing: 'border-box' as const, color: '#2D2D2D',
            }}
          >
            <option value="">時刻を選択</option>
            {timeOptionsForPendingDate.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
