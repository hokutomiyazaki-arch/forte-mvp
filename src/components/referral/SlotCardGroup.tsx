'use client'

/**
 * 希望日時カード群(2026-08-05・CEO指示・段階的追加UI): 第1〜第3希望を「独立したカード」に
 * 包み、境界を明確にする。最初は第1希望カードのみ表示し、完了(値が確定=SlotPickerのdone表示)
 * すると「+ 第2希望を追加する(任意)」ボタンが現れ、押すと第2希望カードが展開する(第3希望も同様・
 * 第2希望完了後)。展開済みのカードで「選択を解除」した場合は、そのカード自体を畳んで
 * 追加ボタンに戻す。
 *
 * クライアント相談フォーム(ReferralRequestForm)・プロ側counter/reschedule
 * (ReferralBookingReceivedCard)の3フォーム共通(重複実装しない)。呼び出し側の状態管理
 * (slot1/2/3のuseState、またはbookingIdごとの[string,string,string]配列)は変更せず、
 * 値の配列+更新コールバックを受け取るだけの表示ラッパー。
 */

import { useState } from 'react'
import SlotPicker from './SlotPicker'

interface Props {
  /** [第1希望, 第2希望, 第3希望] (SlotPickerと同じ"YYYY-MM-DDTHH:mm"形式・空文字は未選択)。 */
  values: [string, string, string]
  onChangeAt: (index: 0 | 1 | 2, next: string) => void
  timeOptions: string[]
}

const CARD_LABELS = ['第1希望（必須）', '第2希望（任意）', '第3希望（任意）'] as const

const cardStyle = {
  border: '1.5px solid #E5E7EB',
  borderRadius: 10,
  padding: '12px 14px',
  marginBottom: 10,
}

const cardHeaderStyle = {
  fontSize: 14,
  fontWeight: 700 as const,
  color: '#1A1A2E',
  marginBottom: 8,
}

const addButtonStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px dashed #C4A35A',
  background: 'transparent',
  color: '#C4A35A',
  fontSize: 13,
  fontWeight: 600 as const,
  cursor: 'pointer' as const,
  marginBottom: 10,
}

export default function SlotCardGroup({ values, onChangeAt, timeOptions }: Props) {
  // 第2・第3希望カードの展開状態。既に値がある場合(フォーム再表示時など)は最初から展開する。
  const [expanded2, setExpanded2] = useState(!!values[1])
  const [expanded3, setExpanded3] = useState(!!values[2])

  function handleChange(index: 0 | 1 | 2, next: string) {
    onChangeAt(index, next)
    // 「選択を解除」(next === '')された場合は、そのカードを畳んで追加ボタンに戻す。
    if (!next) {
      if (index === 1) setExpanded2(false)
      if (index === 2) setExpanded3(false)
    }
  }

  return (
    <div>
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>{CARD_LABELS[0]}</div>
        <SlotPicker value={values[0]} onChange={(next) => handleChange(0, next)} timeOptions={timeOptions} />
      </div>

      {expanded2 ? (
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>{CARD_LABELS[1]}</div>
          <SlotPicker value={values[1]} onChange={(next) => handleChange(1, next)} timeOptions={timeOptions} clearable />
        </div>
      ) : (
        !!values[0] && (
          <button type="button" onClick={() => setExpanded2(true)} style={addButtonStyle}>
            + 第2希望を追加する（任意）
          </button>
        )
      )}

      {expanded3 ? (
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>{CARD_LABELS[2]}</div>
          <SlotPicker value={values[2]} onChange={(next) => handleChange(2, next)} timeOptions={timeOptions} clearable />
        </div>
      ) : (
        !!values[1] && (
          <button type="button" onClick={() => setExpanded3(true)} style={addButtonStyle}>
            + 第3希望を追加する（任意）
          </button>
        )
      )}
    </div>
  )
}
