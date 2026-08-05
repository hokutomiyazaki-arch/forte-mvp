'use client'

/**
 * 日時ピッカー設計最終版(2026-08-05・CEO指示): datetime-localをAndroidのOSピッカーが
 * step属性を無視して年・分ホイールを出す問題(実機確認済み)を受け、datetime-localを廃止し、
 * 自前の「日付(週+曜日ボタン or 手動<input type="date">) + 時刻(<select>・30分刻み)」に置換する。
 * クライアント相談フォーム(ReferralRequestForm)3枠・プロ側counter/reschedule
 * (ReferralBookingReceivedCard)で共通利用する(重複実装しない)。
 *
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

const SEGMENT_OPTIONS: Array<{ label: string; weekOffset: WeekQuickSegment }> = [
  { label: '今週', weekOffset: 0 },
  { label: '来週', weekOffset: 1 },
  { label: '2週間後', weekOffset: 2 },
]

export default function SlotPicker({ value, onChange, timeOptions, clearable }: Props) {
  const [segment, setSegment] = useState<WeekQuickSegment>(0)
  const [manualDateOpen, setManualDateOpen] = useState(false)

  const selectedDate = value ? value.split('T')[0] || '' : ''
  const selectedTime = value ? value.split('T')[1] || '' : ''

  /** 選択中の日付が「今日」なら、過去になった時刻オプションを除外する。 */
  const availableTimeOptions = selectedDate && isTodayDateValue(selectedDate)
    ? timeOptions.filter((t) => t >= jstNextHalfHourTime())
    : timeOptions

  function pickDate(nextDate: string) {
    const timesForDate = isTodayDateValue(nextDate) ? timeOptions.filter((t) => t >= jstNextHalfHourTime()) : timeOptions
    const preferredTime = selectedTime && timesForDate.includes(selectedTime) ? selectedTime : timesForDate[0] || ''
    onChange(preferredTime ? `${nextDate}T${preferredTime}` : '')
  }

  function pickTime(nextTime: string) {
    if (!selectedDate || !nextTime) {
      onChange('')
      return
    }
    onChange(`${selectedDate}T${nextTime}`)
  }

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' as const }}>
        {SEGMENT_OPTIONS.map((opt) => {
          const isSelected = segment === opt.weekOffset
          return (
            <button
              key={opt.weekOffset}
              type="button"
              onClick={() => setSegment(opt.weekOffset)}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: `1px solid ${isSelected ? '#C4A35A' : '#D1D5DB'}`,
                background: isSelected ? '#C4A35A' : '#fff',
                color: isSelected ? '#1A1A2E' : '#555555',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' as const }}>
        {WEEKDAY_QUICK_OPTIONS.map((opt) => {
          const dateForOption = buildQuickWeekdayDate(segment, opt.weekdayMon0)
          const disabled =
            segment === 0 &&
            (isPastWeekdayInCurrentWeek(opt.weekdayMon0) ||
              (isTodayWeekday(opt.weekdayMon0) && !hasRemainingHalfHourSlotToday()))
          const isSelected = !disabled && selectedDate === dateForOption
          return (
            <button
              key={opt.weekdayMon0}
              type="button"
              disabled={disabled}
              onClick={() => pickDate(dateForOption)}
              style={{
                width: 34,
                padding: '4px 0',
                borderRadius: 8,
                border: `1px solid ${isSelected ? '#C4A35A' : '#D1D5DB'}`,
                background: disabled ? '#F3F4F6' : isSelected ? '#FAF3E4' : '#fff',
                color: disabled ? '#C0C4CB' : isSelected ? '#8A6D1F' : '#555555',
                fontSize: 13,
                fontWeight: isSelected ? 700 : 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {!manualDateOpen ? (
        <button
          type="button"
          onClick={() => setManualDateOpen(true)}
          style={{
            background: 'none', border: 'none', color: '#6B7280', fontSize: 13,
            textDecoration: 'underline', cursor: 'pointer', padding: 0, marginBottom: 6,
          }}
        >
          別の日付を選ぶ
        </button>
      ) : (
        <input
          type="date"
          min={jstTodayDateValue()}
          value={selectedDate}
          onChange={(e) => e.target.value && pickDate(e.target.value)}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB',
            fontSize: 13, boxSizing: 'border-box' as const, marginBottom: 6,
          }}
        />
      )}

      <select
        value={selectedTime}
        disabled={!selectedDate}
        onChange={(e) => pickTime(e.target.value)}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB',
          fontSize: 13, boxSizing: 'border-box' as const, color: selectedDate ? '#2D2D2D' : '#9CA3AF',
        }}
      >
        <option value="">{selectedDate ? '時刻を選択' : '先に日付を選んでください'}</option>
        {availableTimeOptions.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      {clearable && value && (
        <button
          type="button"
          onClick={() => onChange('')}
          style={{
            background: 'none', border: 'none', color: '#9CA3AF', fontSize: 13,
            textDecoration: 'underline', cursor: 'pointer', padding: 0, marginTop: 4,
          }}
        >
          選択を解除
        </button>
      )}
    </div>
  )
}
