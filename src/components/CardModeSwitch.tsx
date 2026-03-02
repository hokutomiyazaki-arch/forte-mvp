'use client'
import { useState } from 'react'

type Props = {
  professionalId: string
  initialCardMode: 'pro' | 'general'
}

export default function CardModeSwitch({ professionalId, initialCardMode }: Props) {
  const [cardMode, setCardMode] = useState<'pro' | 'general'>(initialCardMode)
  const [originalMode, setOriginalMode] = useState<'pro' | 'general'>(initialCardMode)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSave() {
    setSaving(true)
    setMessage('')

    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'professionals',
          method: 'update',
          data: { card_mode: cardMode },
          match: { id: professionalId },
        }),
      })

      if (res.ok) {
        setMessage('保存しました')
        setOriginalMode(cardMode)
      } else {
        setMessage('エラー: 保存に失敗しました')
      }
    } catch {
      setMessage('エラー: 保存に失敗しました')
    }
    setSaving(false)
  }

  const hasChanged = cardMode !== originalMode

  return (
    <div style={{
      background: '#fff', borderRadius: 12,
      border: '1px solid #E8E4DC', padding: 20,
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E', marginBottom: 4 }}>
        カードモード
      </h3>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
        NFCカードをタップした時の動作を選択
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        {/* プロモード */}
        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '12px 16px', borderRadius: 8,
          border: cardMode === 'pro' ? '2px solid #C4A35A' : '1px solid #E8E4DC',
          cursor: 'pointer',
          background: cardMode === 'pro' ? 'rgba(196,163,90,0.04)' : '#fff',
        }}>
          <input
            type="radio"
            name="cardMode"
            value="pro"
            checked={cardMode === 'pro'}
            onChange={() => setCardMode('pro')}
            style={{ accentColor: '#C4A35A', marginTop: 2 }}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>
              プロモード
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              タップ → クライアントの投票画面
            </div>
          </div>
        </label>

        {/* 一般モード */}
        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '12px 16px', borderRadius: 8,
          border: cardMode === 'general' ? '2px solid #C4A35A' : '1px solid #E8E4DC',
          cursor: 'pointer',
          background: cardMode === 'general' ? 'rgba(196,163,90,0.04)' : '#fff',
        }}>
          <input
            type="radio"
            name="cardMode"
            value="general"
            checked={cardMode === 'general'}
            onChange={() => setCardMode('general')}
            style={{ accentColor: '#C4A35A', marginTop: 2 }}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>
              一般モード
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              タップ → マイプルーフ表示
            </div>
          </div>
        </label>
      </div>

      {message && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13,
          background: message.startsWith('エラー') ? '#FEE2E2' : '#D1FAE5',
          color: message.startsWith('エラー') ? '#991B1B' : '#065F46',
        }}>
          {message}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !hasChanged}
        style={{
          width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 700,
          background: (!saving && hasChanged) ? '#C4A35A' : '#ddd',
          color: (!saving && hasChanged) ? '#fff' : '#999',
          border: 'none', borderRadius: 8,
          cursor: (!saving && hasChanged) ? 'pointer' : 'default',
        }}
      >
        {saving ? '保存中...' : '保存'}
      </button>
    </div>
  )
}
