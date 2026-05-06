'use client'

import { useState } from 'react'

export type ProfessionType = 'trainer' | 'therapist' | 'yoga' | 'nutrition' | 'other'

const OPTIONS: { value: ProfessionType; label: string }[] = [
  { value: 'trainer', label: 'トレーナー' },
  { value: 'therapist', label: '整体・施術系' },
  { value: 'yoga', label: 'ヨガ・ピラティス' },
  { value: 'nutrition', label: '栄養指導' },
  { value: 'other', label: 'その他' },
]

interface Props {
  open: boolean
  onSaved: (type: ProfessionType) => void
}

export default function ProfessionTypeModal({ open, onSaved }: Props) {
  const [selected, setSelected] = useState<ProfessionType | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const handleSave = async () => {
    if (!selected) {
      setError('業種を選択してください')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/pro/profession-type', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profession_type: selected }),
        cache: 'no-store',
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || '保存に失敗しました')
        return
      }
      onSaved(selected)
    } catch (err: any) {
      setError(err.message || '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          padding: 24,
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1A1A2E', marginBottom: 8 }}>
          あなたの業種を教えてください
        </h2>
        <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6, marginBottom: 20 }}>
          これによってメニュー登録時の例文が業種に合った内容に変わります。
        </p>

        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 20 }}>
          {OPTIONS.map(opt => (
            <label
              key={opt.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                border: selected === opt.value ? '2px solid #C4A35A' : '1px solid #E5E7EB',
                borderRadius: 8,
                cursor: 'pointer',
                background: selected === opt.value ? 'rgba(196,163,90,0.08)' : 'white',
              }}
            >
              <input
                type="radio"
                name="profession_type"
                value={opt.value}
                checked={selected === opt.value}
                onChange={() => setSelected(opt.value)}
                disabled={saving}
                style={{ accentColor: '#C4A35A' }}
              />
              <span style={{ fontSize: 14, color: '#1A1A2E' }}>{opt.label}</span>
            </label>
          ))}
        </div>

        {error && (
          <p style={{ fontSize: 13, color: '#E24B4A', marginBottom: 12 }}>{error}</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !selected}
          style={{
            width: '100%',
            padding: '12px 16px',
            background: !selected || saving ? '#E5E7EB' : '#C4A35A',
            color: !selected || saving ? '#9CA3AF' : '#1A1A2E',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            cursor: !selected || saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? '保存中...' : '保存する'}
        </button>
      </div>
    </div>
  )
}
