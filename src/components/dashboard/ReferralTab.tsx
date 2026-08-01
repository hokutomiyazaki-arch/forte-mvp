'use client'

import { useEffect, useState } from 'react'

interface PinPro {
  id: string
  name: string
  title: string | null
  photo_url: string | null
  accepting_status: 'open' | 'conditional' | 'closed' | null
}

interface ListItem {
  id: string
  list_id: string
  pro_id: string
  note: string | null
  sort_order: number
  consent_status: 'pending' | 'approved' | 'declined'
  created_at: string
  professionals: PinPro | null
}

interface ReferralList {
  id: string
  title: string
  comment: string | null
  visibility: 'link' | 'private' | 'public'
  slug: string
  is_delegate: boolean
  created_at: string
  updated_at: string
  items: ListItem[]
}

interface SearchResultPro {
  id: string
  name: string
  title: string | null
  photo_url: string | null
  prefecture: string | null
  accepting_status: 'open' | 'conditional' | 'closed' | null
}

const MAX_PINS = 3
const SHARE_ORIGIN = 'https://realproof.jp'

const ACCEPTING_OPTIONS: { value: 'open' | 'conditional' | 'closed'; label: string }[] = [
  { value: 'open', label: '受付中' },
  { value: 'conditional', label: '条件付きで受付中' },
  { value: 'closed', label: '受付停止中' },
]

interface Props {
  proId: string
  initialAcceptingStatus: 'open' | 'conditional' | 'closed' | null
  initialAcceptingNote: string | null
  onAcceptingUpdated: (status: 'open' | 'conditional' | 'closed', note: string | null) => void
}

export default function ReferralTab({ proId, initialAcceptingStatus, initialAcceptingNote, onAcceptingUpdated }: Props) {
  // 受付ステータス
  const [acceptingStatus, setAcceptingStatus] = useState<'open' | 'conditional' | 'closed'>(
    initialAcceptingStatus || 'closed'
  )
  const [acceptingNote, setAcceptingNote] = useState(initialAcceptingNote || '')
  const [savingAccepting, setSavingAccepting] = useState(false)

  // リスト一覧
  const [lists, setLists] = useState<ReferralList[]>([])
  const [listsLoading, setListsLoading] = useState(true)

  // 新規リスト作成フォーム
  const [newTitle, setNewTitle] = useState('')
  const [newComment, setNewComment] = useState('')
  const [creating, setCreating] = useState(false)

  // ピン追加UI（リストごとに検索クエリ・結果を保持）
  const [pinQuery, setPinQuery] = useState<Record<string, string>>({})
  const [pinResults, setPinResults] = useState<Record<string, SearchResultPro[]>>({})
  const [pinSearching, setPinSearching] = useState<Record<string, boolean>>({})
  const [addingPin, setAddingPin] = useState<string | null>(null)

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/referral/lists', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.lists) setLists(data.lists)
      })
      .catch(() => {})
      .finally(() => setListsLoading(false))
  }, [])

  async function saveAccepting() {
    setSavingAccepting(true)
    try {
      const res = await fetch('/api/referral/accepting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accepting_status: acceptingStatus,
          accepting_note: acceptingStatus === 'conditional' ? acceptingNote : null,
        }),
      })
      if (res.ok) {
        onAcceptingUpdated(acceptingStatus, acceptingStatus === 'conditional' ? acceptingNote : null)
      }
    } finally {
      setSavingAccepting(false)
    }
  }

  async function createList() {
    const title = newTitle.trim()
    if (!title) return
    setCreating(true)
    try {
      const res = await fetch('/api/referral/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, comment: newComment.trim() || null }),
      })
      if (res.ok) {
        const data = await res.json()
        setLists((prev) => [data.list, ...prev])
        setNewTitle('')
        setNewComment('')
      }
    } finally {
      setCreating(false)
    }
  }

  async function deleteList(listId: string) {
    if (!window.confirm('このリストを削除しますか？（ピンした先生への通知は解除されます）')) return
    const res = await fetch(`/api/referral/lists/${listId}`, { method: 'DELETE' })
    if (res.ok) {
      setLists((prev) => prev.filter((l) => l.id !== listId))
    }
  }

  async function searchPro(listId: string, query: string) {
    setPinQuery((prev) => ({ ...prev, [listId]: query }))
    if (!query.trim()) {
      setPinResults((prev) => ({ ...prev, [listId]: [] }))
      return
    }
    setPinSearching((prev) => ({ ...prev, [listId]: true }))
    try {
      const res = await fetch(`/api/referral/pro-search?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setPinResults((prev) => ({ ...prev, [listId]: data.professionals || [] }))
      }
    } finally {
      setPinSearching((prev) => ({ ...prev, [listId]: false }))
    }
  }

  async function addPin(listId: string, targetProId: string) {
    setAddingPin(listId)
    try {
      const res = await fetch(`/api/referral/lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: targetProId }),
      })
      if (res.ok) {
        const data = await res.json()
        setLists((prev) =>
          prev.map((l) =>
            l.id === listId
              ? { ...l, items: [...l.items, { ...data.item, professionals: pinResults[listId]?.find((p) => p.id === targetProId) || null }] }
              : l
          )
        )
        setPinQuery((prev) => ({ ...prev, [listId]: '' }))
        setPinResults((prev) => ({ ...prev, [listId]: [] }))
      } else {
        const err = await res.json().catch(() => ({}))
        if (err.error === 'max_pins_reached') {
          window.alert('1つのリストにピンできるのは最大3名までです')
        } else if (err.error === 'already_pinned') {
          window.alert('すでにこのリストに追加されています')
        } else {
          window.alert('追加に失敗しました')
        }
      }
    } finally {
      setAddingPin(null)
    }
  }

  async function removePin(listId: string, targetProId: string) {
    const res = await fetch(`/api/referral/lists/${listId}/items`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: targetProId }),
    })
    if (res.ok) {
      setLists((prev) =>
        prev.map((l) => (l.id === listId ? { ...l, items: l.items.filter((i) => i.pro_id !== targetProId) } : l))
      )
    }
  }

  async function updatePinNote(listId: string, targetProId: string, note: string) {
    const res = await fetch(`/api/referral/lists/${listId}/items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: targetProId, note }),
    })
    if (res.ok) {
      setLists((prev) =>
        prev.map((l) =>
          l.id === listId
            ? { ...l, items: l.items.map((i) => (i.pro_id === targetProId ? { ...i, note } : i)) }
            : l
        )
      )
    }
  }

  function copyShareUrl(slug: string) {
    const url = `${SHARE_ORIGIN}/r/${slug}`
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug(null), 2000)
    })
  }

  const consentLabel = (status: 'pending' | 'approved' | 'declined') => {
    if (status === 'approved') return { text: '承諾済み', color: '#2E7D32' }
    if (status === 'declined') return { text: '辞退されました', color: '#B00020' }
    return { text: '承諾待ち', color: '#B8860B' }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 受け入れステータス */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '18px 16px', border: '1px solid #E5E7EB' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 4 }}>受け入れステータス</h3>
        <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12, lineHeight: 1.5 }}>
          紹介先として表示されるかどうかに関わる状態です。停止中でも、ピン指名では「現在受付停止中」として表示されます。
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {ACCEPTING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setAcceptingStatus(opt.value)}
              style={{
                flex: 1, padding: '8px 6px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: acceptingStatus === opt.value ? '2px solid #C4A35A' : '1px solid #E5E7EB',
                background: acceptingStatus === opt.value ? '#FFF9EC' : '#fff',
                color: acceptingStatus === opt.value ? '#1A1A2E' : '#6B7280',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {acceptingStatus === 'conditional' && (
          <textarea
            value={acceptingNote}
            onChange={(e) => setAcceptingNote(e.target.value.slice(0, 200))}
            placeholder="条件の内容（例: 新規は月◯名まで、など）"
            style={{
              width: '100%', minHeight: 60, padding: '8px 10px', borderRadius: 8,
              border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' as const,
              marginBottom: 10, resize: 'vertical' as const,
            }}
          />
        )}
        <button
          onClick={saveAccepting}
          disabled={savingAccepting}
          style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: '#1A1A2E', color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: savingAccepting ? 'default' : 'pointer', opacity: savingAccepting ? 0.6 : 1,
          }}
        >
          {savingAccepting ? '保存中...' : '保存する'}
        </button>
      </div>

      {/* リスト作成 */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '18px 16px', border: '1px solid #E5E7EB' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 10 }}>新しい処方箋リストを作る</h3>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value.slice(0, 200))}
          placeholder="例: 名古屋圏・めまい/ふらつき"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB',
            fontSize: 13, boxSizing: 'border-box' as const, marginBottom: 8,
          }}
        />
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="選定基準の説明（例: 私が信頼して紹介できる先生方です）"
          style={{
            width: '100%', minHeight: 60, padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB',
            fontSize: 13, boxSizing: 'border-box' as const, marginBottom: 10, resize: 'vertical' as const,
          }}
        />
        <button
          onClick={createList}
          disabled={creating || !newTitle.trim()}
          style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: '#C4A35A', color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: creating || !newTitle.trim() ? 'default' : 'pointer',
            opacity: creating || !newTitle.trim() ? 0.6 : 1,
          }}
        >
          {creating ? '作成中...' : 'リストを作成'}
        </button>
      </div>

      {/* リスト一覧 */}
      {listsLoading ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: '#9CA3AF', fontSize: 13 }}>読み込み中...</div>
      ) : lists.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: '#9CA3AF', fontSize: 13 }}>
          まだ処方箋リストがありません
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {lists.map((list) => (
            <div key={list.id} style={{ background: '#fff', borderRadius: 14, padding: '16px', border: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>{list.title}</div>
                  {list.comment && (
                    <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4, lineHeight: 1.5 }}>{list.comment}</div>
                  )}
                </div>
                <button
                  onClick={() => deleteList(list.id)}
                  style={{ background: 'none', border: 'none', color: '#B00020', fontSize: 12, cursor: 'pointer' }}
                >
                  削除
                </button>
              </div>

              <div
                onClick={() => copyShareUrl(list.slug)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', background: '#F9FAFB', borderRadius: 8,
                  fontSize: 12, color: '#6B7280', cursor: 'pointer', marginBottom: 12,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                  {SHARE_ORIGIN}/r/{list.slug}
                </span>
                <span style={{ color: '#C4A35A', fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
                  {copiedSlug === list.slug ? 'コピーしました' : 'コピー'}
                </span>
              </div>

              {/* ピン一覧 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {list.items.map((item) => {
                  const label = consentLabel(item.consent_status)
                  return (
                    <div
                      key={item.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#F9FAFB', borderRadius: 8 }}
                    >
                      {item.professionals?.photo_url ? (
                        <img src={item.professionals.photo_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#E5E7EB', flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>
                          {item.professionals?.name || '不明なプロ'}
                        </div>
                        <div style={{ fontSize: 11, color: label.color }}>{label.text}</div>
                        <input
                          defaultValue={item.note || ''}
                          onBlur={(e) => {
                            if (e.target.value !== (item.note || '')) {
                              updatePinNote(list.id, item.pro_id, e.target.value)
                            }
                          }}
                          placeholder="一言（例: 産後のケアが得意です）"
                          style={{
                            width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E7EB',
                            fontSize: 12, marginTop: 4, boxSizing: 'border-box' as const,
                          }}
                        />
                      </div>
                      <button
                        onClick={() => removePin(list.id, item.pro_id)}
                        style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                      >
                        除去
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* ピン追加 */}
              {list.items.length < MAX_PINS ? (
                <div style={{ position: 'relative' }}>
                  <input
                    value={pinQuery[list.id] || ''}
                    onChange={(e) => searchPro(list.id, e.target.value)}
                    placeholder="名前でプロを検索してピン追加（最大3名）"
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E7EB',
                      fontSize: 13, boxSizing: 'border-box' as const,
                    }}
                  />
                  {(pinResults[list.id]?.length || 0) > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                      background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
                      marginTop: 4, maxHeight: 200, overflowY: 'auto' as const,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    }}>
                      {(pinResults[list.id] || []).map((p) => (
                        <div
                          key={p.id}
                          onClick={() => addingPin ? undefined : addPin(list.id, p.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                            cursor: addingPin ? 'default' : 'pointer', borderBottom: '1px solid #F3F4F6',
                          }}
                        >
                          {p.photo_url ? (
                            <img src={p.photo_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E5E7EB' }} />
                          )}
                          <div style={{ fontSize: 13, color: '#1A1A2E' }}>{p.name}</div>
                          {p.title && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{p.title}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>ピンは最大3名までです</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
