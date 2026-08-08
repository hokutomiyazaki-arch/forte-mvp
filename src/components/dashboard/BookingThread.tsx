'use client'

import { useEffect, useState } from 'react'
import LinkedText from '@/components/LinkedText'

interface HandoverNote {
  theme: string
  history: string
  tried: string
  notes: string
}

interface Message {
  id: string
  sender_pro_id: string
  body: string
  created_at: string
  read_at: string | null
}

interface Props {
  bookingId: string
  ownProId: string
  /** 送り手本人かどうか。true の場合のみ引き継ぎメモの編集フォームを表示する。 */
  isSender: boolean
  initialHandoverNote: Partial<HandoverNote> | null
  /** CEO追加指示(2026-08-04): 「誰とのやりとりか」を明示するための相手の関係性ラベル
   * (受け手視点なら'紹介元'、送り手視点なら'担当プロ'等)。未指定時は既存の汎用文言のまま
   * (直接予約等で相手ラベルが無い場合)。呼び出し元の既存表示ロジックは変更しない。 */
  partnerRoleLabel?: string
  /** 相手の名前(任意)。指定時は「{partnerRoleLabel}の{partnerName}さんとのやりとりです」と表示する。 */
  partnerName?: string
}

const EMPTY_NOTE: HandoverNote = { theme: '', history: '', tried: '', notes: '' }

/**
 * §2-10: 案件スレッド(自由記述コメント)+ 引き継ぎメモ(構造化)の開閉式ビュー。
 * 参加者(送り手・受け手)のみ利用可能。原文表示(AI変換は適用しない)。
 */
export default function BookingThread({
  bookingId,
  ownProId,
  isSender,
  initialHandoverNote,
  partnerRoleLabel,
  partnerName,
}: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [newBody, setNewBody] = useState('')
  const [sending, setSending] = useState(false)

  const [note, setNote] = useState<HandoverNote>({ ...EMPTY_NOTE, ...(initialHandoverNote || {}) })
  const [savingNote, setSavingNote] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoadingMessages(true)
    fetch(`/api/referral/bookings/${bookingId}/messages`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.messages) setMessages(data.messages)
      })
      .catch(() => {})
      .finally(() => setLoadingMessages(false))
  }, [open, bookingId])

  async function sendMessage() {
    const body = newBody.trim()
    if (!body) return
    setSending(true)
    try {
      const res = await fetch(`/api/referral/bookings/${bookingId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ body }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.message) setMessages((prev) => [...prev, data.message])
        setNewBody('')
      } else {
        window.alert('送信に失敗しました')
      }
    } finally {
      setSending(false)
    }
  }

  async function saveNote() {
    setSavingNote(true)
    setNoteSaved(false)
    try {
      const res = await fetch(`/api/referral/bookings/${bookingId}/handover`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(note),
      })
      if (res.ok) {
        setNoteSaved(true)
        setTimeout(() => setNoteSaved(false), 2000)
      } else {
        window.alert('保存に失敗しました')
      }
    } finally {
      setSavingNote(false)
    }
  }

  const hasNoteContent = note.theme || note.history || note.tried || note.notes

  return (
    <div style={{ marginTop: 10, borderTop: '1px dashed #D1D5DB', paddingTop: 10 }}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        style={{
          background: 'none', border: 'none', color: '#1A1A2E', fontSize: 12,
          fontWeight: 600, cursor: 'pointer', padding: 0,
        }}
      >
        {open
          ? '案件スレッドを閉じる ▲'
          : partnerRoleLabel
            ? `${partnerRoleLabel}とのやりとり・引き継ぎメモを開く ▼`
            : '案件スレッド・引き継ぎメモを開く ▼'}
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* CEO追加指示(2026-08-04): 「誰とのやりとりか」＋「クライアントには表示されません」を
              視点に依らず共通で明示する(誤爆防止の安心材料)。 */}
          <div style={{ fontSize: 13, color: '#6B7280' }}>
            {partnerRoleLabel
              ? partnerName
                ? `${partnerRoleLabel}の${partnerName}さんとのやりとりです（クライアントには表示されません）`
                : `${partnerRoleLabel}とのやりとりです（クライアントには表示されません）`
              : 'このやりとりはクライアントには表示されません'}
          </div>
          {/* 引き継ぎメモ */}
          <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1A2E', marginBottom: 6 }}>引き継ぎメモ</div>
            {isSender ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  value={note.theme}
                  onChange={(e) => setNote((prev) => ({ ...prev, theme: e.target.value.slice(0, 1000) }))}
                  placeholder="テーマ"
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 12, boxSizing: 'border-box' as const }}
                />
                <textarea
                  value={note.history}
                  onChange={(e) => setNote((prev) => ({ ...prev, history: e.target.value.slice(0, 1000) }))}
                  placeholder="これまでの経過"
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 12, minHeight: 44, boxSizing: 'border-box' as const, resize: 'vertical' as const }}
                />
                <textarea
                  value={note.tried}
                  onChange={(e) => setNote((prev) => ({ ...prev, tried: e.target.value.slice(0, 1000) }))}
                  placeholder="試したこと"
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 12, minHeight: 44, boxSizing: 'border-box' as const, resize: 'vertical' as const }}
                />
                <textarea
                  value={note.notes}
                  onChange={(e) => setNote((prev) => ({ ...prev, notes: e.target.value.slice(0, 1000) }))}
                  placeholder="申し送り事項"
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 12, minHeight: 44, boxSizing: 'border-box' as const, resize: 'vertical' as const }}
                />
                <button
                  onClick={saveNote}
                  disabled={savingNote}
                  style={{
                    alignSelf: 'flex-start', padding: '6px 16px', borderRadius: 6, border: 'none',
                    background: '#1A1A2E', color: '#fff', fontSize: 12, fontWeight: 600,
                    cursor: savingNote ? 'default' : 'pointer', opacity: savingNote ? 0.6 : 1,
                  }}
                >
                  {savingNote ? '保存中...' : noteSaved ? '保存しました' : 'メモを保存'}
                </button>
              </div>
            ) : hasNoteContent ? (
              <div style={{ fontSize: 12, color: '#333', lineHeight: 1.7 }}>
                {note.theme && <div>テーマ: {note.theme}</div>}
                {note.history && <div>これまでの経過: {note.history}</div>}
                {note.tried && <div>試したこと: {note.tried}</div>}
                {note.notes && <div>申し送り事項: {note.notes}</div>}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#9CA3AF' }}>まだ引き継ぎメモは記入されていません</div>
            )}
          </div>

          {/* 案件スレッド */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1A2E', marginBottom: 6 }}>案件スレッド</div>
            {loadingMessages ? (
              <div style={{ fontSize: 12, color: '#9CA3AF' }}>読み込み中...</div>
            ) : messages.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>まだコメントはありません</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.sender_pro_id === ownProId ? 'flex-end' : 'flex-start',
                      background: m.sender_pro_id === ownProId ? '#FFF9EC' : '#F3F4F6',
                      borderRadius: 8, padding: '6px 10px', maxWidth: '85%',
                    }}
                  >
                    {/* §17-14: URLはリンクにする（どちらの吹き出しも淡色地なので variant は既定） */}
                    <div style={{ fontSize: 12, color: '#1A1A2E', whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const }}>
                      <LinkedText text={m.body} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* CEO指摘(スクショ・機種による横スクロール対策): 送信ボタンを入力欄の右横ではなく
                下(右寄せ)に配置し、入力欄は常に幅いっぱいにする(はみ出し防止)。 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                value={newBody}
                onChange={(e) => setNewBody(e.target.value.slice(0, 2000))}
                placeholder="コメントを入力"
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 12, boxSizing: 'border-box' as const }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !newBody.trim()}
                style={{
                  alignSelf: 'flex-end', padding: '6px 14px', borderRadius: 6, border: 'none',
                  background: '#C4A35A', color: '#fff', fontSize: 12, fontWeight: 600,
                  cursor: sending || !newBody.trim() ? 'default' : 'pointer',
                  opacity: sending || !newBody.trim() ? 0.6 : 1,
                }}
              >
                送信
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
