'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export default function CardModeSwitch() {
  const supabase = createClient()
  const { user: authUser, isPro } = useAuth()

  const [cardMode, setCardMode] = useState<'pro' | 'general'>('pro')
  const [originalMode, setOriginalMode] = useState<'pro' | 'general'>('pro')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [hasPro, setHasPro] = useState(false)

  useEffect(() => {
    if (!authUser?.id) return
    loadCardMode()
  }, [authUser?.id])

  async function loadCardMode() {
    if (!authUser?.id) return
    setLoading(true)

    const { data: proData } = await (supabase as any)
      .from('professionals')
      .select('id, card_mode')
      .eq('user_id', authUser.id)
      .maybeSingle()

    if (proData) {
      setHasPro(true)
      const mode = proData.card_mode || 'pro'
      setCardMode(mode)
      setOriginalMode(mode)
    } else {
      setHasPro(false)
      setCardMode('general')
      setOriginalMode('general')
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!authUser?.id) return
    setSaving(true)
    setMessage('')

    const { error } = await (supabase as any)
      .from('professionals')
      .update({ card_mode: cardMode })
      .eq('user_id', authUser.id)

    if (error) {
      setMessage('エラー: 保存に失敗しました')
    } else {
      setMessage('保存しました')
      setOriginalMode(cardMode)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: '#888', fontSize: 13 }}>
        読み込み中...
      </div>
    )
  }

  const hasChanged = cardMode !== originalMode

  return (
    <div style={{
      background: '#fff', borderRadius: 12,
      border: '1px solid #E8E4DC', padding: 20,
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E', marginBottom: 16 }}>
        プルーフカードモード
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        {/* プロモード */}
        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '12px 16px', borderRadius: 8,
          border: cardMode === 'pro' ? '2px solid #C4A35A' : '1px solid #E8E4DC',
          cursor: hasPro ? 'pointer' : 'default',
          opacity: hasPro ? 1 : 0.5,
          background: cardMode === 'pro' ? 'rgba(196,163,90,0.04)' : '#fff',
        }}>
          <input
            type="radio"
            name="cardMode"
            value="pro"
            checked={cardMode === 'pro'}
            onChange={() => hasPro && setCardMode('pro')}
            disabled={!hasPro}
            style={{ accentColor: '#C4A35A', marginTop: 2 }}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>
              プロモード
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              タップ → クライアントの投票画面
            </div>
            {!hasPro && (
              <div style={{ fontSize: 11, color: '#e74c3c', marginTop: 4 }}>
                先にプロ登録してください
              </div>
            )}
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
