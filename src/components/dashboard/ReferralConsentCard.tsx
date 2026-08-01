'use client'

import { useEffect, useState } from 'react'

interface ConsentItem {
  id: string
  list_id: string
  note: string | null
  consent_status: 'pending' | 'approved' | 'declined'
  created_at: string
  referral_lists: {
    id: string
    title: string
    owner_id: string
    professionals: { id: string; name: string; photo_url: string | null } | null
  } | null
}

/**
 * §3-1 第2層: 掲載通知＋拒否権。
 * 自分が誰かの処方箋リストに載せられようとしている(pending)場合、承諾/拒否を選べるカード。
 * ★ isReferralEnabled ではゲートしない（先行アクセス外のプロも自分の掲載可否は操作できる必要がある）。
 * タブに依存せずダッシュボード上部に常時表示する想定。pending が無ければ何も描画しない。
 */
export default function ReferralConsentCard() {
  const [items, setItems] = useState<ConsentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/referral/consents', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.items) setItems(data.items)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const pendingItems = items.filter((i) => i.consent_status === 'pending')

  async function respond(itemId: string, consent_status: 'approved' | 'declined') {
    setProcessingId(itemId)
    try {
      const res = await fetch('/api/referral/consents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, consent_status }),
      })
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== itemId))
      }
    } finally {
      setProcessingId(null)
    }
  }

  if (loading || pendingItems.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
      {pendingItems.map((item) => {
        const ownerName = item.referral_lists?.professionals?.name || 'プロ'
        const listTitle = item.referral_lists?.title || '紹介リスト'
        return (
          <div
            key={item.id}
            style={{
              background: '#FFF9EC',
              border: '1px solid #E9D9A8',
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 1.6, marginBottom: 10 }}>
              <strong>{ownerName}さん</strong>が、あなたを紹介リスト「{listTitle}」に掲載しようとしています。
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => respond(item.id, 'approved')}
                disabled={processingId === item.id}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
                  background: '#C4A35A', color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: processingId === item.id ? 'default' : 'pointer',
                  opacity: processingId === item.id ? 0.6 : 1,
                }}
              >
                承諾する
              </button>
              <button
                onClick={() => respond(item.id, 'declined')}
                disabled={processingId === item.id}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8,
                  border: '1px solid #D1D5DB', background: '#fff', color: '#6B7280',
                  fontSize: 13, fontWeight: 600,
                  cursor: processingId === item.id ? 'default' : 'pointer',
                  opacity: processingId === item.id ? 0.6 : 1,
                }}
              >
                辞退する
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
