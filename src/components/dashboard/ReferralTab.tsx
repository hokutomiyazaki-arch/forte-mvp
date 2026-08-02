'use client'

import { useEffect, useRef, useState } from 'react'
import BookingThread from '@/components/dashboard/BookingThread'
import { computeReferralSignal, REFERRAL_SIGNAL_DOT } from '@/lib/referral-accepting'

interface PinPro {
  id: string
  name: string
  title: string | null
  photo_url: string | null
  accepting_status: 'open' | 'closed' | null
  delegate_list_id?: string | null
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
  accepting_status: 'open' | 'closed' | null
  delegate_list_id?: string | null
  referralSignal?: 'open' | 'delegate' | 'closed'
}

interface SentBooking {
  id: string
  list_id: string
  menu_name: string | null
  theme_tags: string[] | null
  status: 'requested' | 'confirmed' | 'completed' | 'cancelled' | 'expired'
  price_jpy: number
  handover_note: { theme?: string; history?: string; tried?: string; notes?: string } | null
  confirmed_at: string | null
  completed_at: string | null
  created_at: string
  client_nickname: string
  receiver_pro: { id: string; name: string } | null
}

const SENT_STATUS_LABEL: Record<SentBooking['status'], string> = {
  requested: 'リクエスト中',
  confirmed: '確定',
  completed: '完了',
  cancelled: '辞退・キャンセル',
  expired: '失効',
}

const MAX_PINS = 3
const SHARE_ORIGIN = 'https://realproof.jp'

interface Props {
  proId: string
}

export default function ReferralTab({ proId }: Props) {
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
  // §2-2改訂: 「紹介につながる人のみ表示」フィルタ(仕様通りデフォルトOFF)
  const [referralOnlyFilter, setReferralOnlyFilter] = useState(false)

  // §3-1: 連携候補(private)→処方箋リスト(link/public)への追加導線
  // key = `${sourceListId}:${pro_id}`
  const [addToListSelection, setAddToListSelection] = useState<Record<string, string>>({})
  const [addToListState, setAddToListState] = useState<
    Record<string, { status: 'loading' | 'success' | 'error'; message?: string }>
  >({})

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  // §2-9: RP外のプロを招待するフォーム（リストごとに名前入力・発行済みURLを保持）
  const [inviteName, setInviteName] = useState<Record<string, string>>({})
  const [invitingList, setInvitingList] = useState<string | null>(null)
  const [issuedInviteUrl, setIssuedInviteUrl] = useState<Record<string, string>>({})

  // §2-10: 送り手側の成立予約一覧（案件スレッド・引き継ぎメモの入口）
  const [sentBookings, setSentBookings] = useState<SentBooking[]>([])
  const [sentLoading, setSentLoading] = useState(true)

  useEffect(() => {
    fetch('/api/referral/lists', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.lists) setLists(data.lists)
      })
      .catch(() => {})
      .finally(() => setListsLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/referral/bookings/sent', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.bookings) setSentBookings(data.bookings)
      })
      .catch(() => {})
      .finally(() => setSentLoading(false))
  }, [])

  async function createList() {
    const title = newTitle.trim()
    if (!title) return
    setCreating(true)
    try {
      const res = await fetch('/api/referral/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
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
    const res = await fetch(`/api/referral/lists/${listId}`, { method: 'DELETE', cache: 'no-store' })
    if (res.ok) {
      setLists((prev) => prev.filter((l) => l.id !== listId))
    }
  }

  // 軽微指摘: 入力毎に即fetchせず300msデバウンスする(リストごとにタイマーを保持)
  const searchTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  async function runProSearch(listId: string, query: string) {
    setPinSearching((prev) => ({ ...prev, [listId]: true }))
    try {
      const url = `/api/referral/pro-search?q=${encodeURIComponent(query)}${referralOnlyFilter ? '&referral_only=1' : ''}`
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setPinResults((prev) => ({ ...prev, [listId]: data.professionals || [] }))
      }
    } finally {
      setPinSearching((prev) => ({ ...prev, [listId]: false }))
    }
  }

  function searchPro(listId: string, query: string) {
    setPinQuery((prev) => ({ ...prev, [listId]: query }))
    if (searchTimersRef.current[listId]) {
      clearTimeout(searchTimersRef.current[listId])
    }
    const trimmed = query.trim()
    if (!trimmed) {
      setPinResults((prev) => ({ ...prev, [listId]: [] }))
      return
    }
    searchTimersRef.current[listId] = setTimeout(() => {
      runProSearch(listId, trimmed)
    }, 300)
  }

  async function addPin(listId: string, targetProId: string) {
    setAddingPin(listId)
    try {
      const res = await fetch(`/api/referral/lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
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
      cache: 'no-store',
      body: JSON.stringify({ pro_id: targetProId }),
    })
    if (res.ok) {
      setLists((prev) =>
        prev.map((l) => (l.id === listId ? { ...l, items: l.items.filter((i) => i.pro_id !== targetProId) } : l))
      )
    }
  }

  // §3-1: 連携候補(private)の1行から自分の処方箋リスト(link/public)へ追加する。
  // 実処理は既存の items POST をそのまま呼ぶ(=pendingで追加され掲載通知が飛ぶ)。
  async function addCandidateToOwnList(sourceListId: string, item: ListItem, explicitTargetListId?: string) {
    const key = `${sourceListId}:${item.pro_id}`
    const targetListId =
      explicitTargetListId || (publicLists.length === 1 ? publicLists[0].id : addToListSelection[key])
    if (!targetListId) return

    setAddToListState((prev) => ({ ...prev, [key]: { status: 'loading' } }))
    try {
      const res = await fetch(`/api/referral/lists/${targetListId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ pro_id: item.pro_id }),
      })
      if (res.ok) {
        const data = await res.json()
        setLists((prev) =>
          prev.map((l) =>
            l.id === targetListId
              ? { ...l, items: [...l.items, { ...data.item, professionals: item.professionals }] }
              : l
          )
        )
        setAddToListState((prev) => ({
          ...prev,
          [key]: { status: 'success', message: '追加しました（掲載通知を送信します）' },
        }))
      } else {
        const err = await res.json().catch(() => ({}))
        const message =
          err.error === 'already_pinned'
            ? 'すでにこのリストに追加されています'
            : err.error === 'max_pins_reached'
              ? 'このリストは最大3名までです（上限に達しています）'
              : '追加に失敗しました'
        setAddToListState((prev) => ({ ...prev, [key]: { status: 'error', message } }))
      }
    } catch {
      setAddToListState((prev) => ({ ...prev, [key]: { status: 'error', message: '追加に失敗しました' } }))
    }
  }

  async function updatePinNote(listId: string, targetProId: string, note: string) {
    const res = await fetch(`/api/referral/lists/${listId}/items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
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

  async function createInvite(listId: string) {
    const name = (inviteName[listId] || '').trim()
    if (!name) return
    setInvitingList(listId)
    try {
      const res = await fetch('/api/referral/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ list_id: listId, invitee_name: name }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.invite_url) {
          setIssuedInviteUrl((prev) => ({ ...prev, [listId]: data.invite_url }))
        }
        setInviteName((prev) => ({ ...prev, [listId]: '' }))
      } else {
        const err = await res.json().catch(() => ({}))
        if (err.error === 'too_many_pending_invites') {
          window.alert('未登録の招待が既に10件あります。登録完了を待つか、しばらくしてから再度お試しください')
        } else {
          window.alert('招待の発行に失敗しました')
        }
      }
    } finally {
      setInvitingList(null)
    }
  }

  function copyInviteUrl(listId: string, url: string) {
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedSlug(`invite:${listId}`)
      setTimeout(() => setCopiedSlug(null), 2000)
    })
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

  // §3-2/中1: visibility='private' は「連携候補（非公開）」= 共有URLを持たない社内向けリスト。
  // 共有URLコピー・招待UI・承諾待ちバッジ(§3-1: 非公開リストは同意不要)を出さない。
  const publicLists = lists.filter((l) => l.visibility !== 'private')
  const privateLists = lists.filter((l) => l.visibility === 'private')

  function renderListCard(list: ReferralList, isPrivate: boolean) {
    return (
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

        {!isPrivate && (
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
        )}

        {/* ピン一覧 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {list.items.map((item) => {
            const label = consentLabel(item.consent_status)
            const addKey = `${list.id}:${item.pro_id}`
            const addState = addToListState[addKey]
            return (
              <div
                key={item.id}
                style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', background: '#F9FAFB', borderRadius: 8 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {item.professionals?.photo_url ? (
                    <img src={item.professionals.photo_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#E5E7EB', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>
                      {item.professionals?.name || '不明なプロ'}
                    </div>
                    {!isPrivate && <div style={{ fontSize: 11, color: label.color }}>{label.text}</div>}
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

                {/* §3-1: 連携候補(private)行のみ「処方箋リストへ追加」導線を出す */}
                {isPrivate && (
                  <div style={{ paddingLeft: 42 }}>
                    {publicLists.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                        先に紹介リストを作成してください
                      </div>
                    ) : addState?.status === 'success' ? (
                      <div style={{ fontSize: 11, color: '#2E7D32' }}>{addState.message}</div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                        {publicLists.length > 1 && (
                          <select
                            value={addToListSelection[addKey] || publicLists[0].id}
                            onChange={(e) =>
                              setAddToListSelection((prev) => ({ ...prev, [addKey]: e.target.value }))
                            }
                            style={{
                              padding: '4px 6px', borderRadius: 6, border: '1px solid #E5E7EB',
                              fontSize: 11, color: '#1A1A2E',
                            }}
                          >
                            {publicLists.map((l) => (
                              <option key={l.id} value={l.id}>{l.title}</option>
                            ))}
                          </select>
                        )}
                        <button
                          onClick={() => addCandidateToOwnList(list.id, item)}
                          disabled={addState?.status === 'loading'}
                          style={{
                            background: 'none', border: '1px solid #C4A35A', color: '#C4A35A',
                            borderRadius: 6, fontSize: 11, fontWeight: 600, padding: '3px 8px',
                            cursor: addState?.status === 'loading' ? 'default' : 'pointer',
                            opacity: addState?.status === 'loading' ? 0.6 : 1,
                          }}
                        >
                          {addState?.status === 'loading' ? '追加中...' : '紹介リストへ追加'}
                        </button>
                        {addState?.status === 'error' && (
                          <span style={{ fontSize: 11, color: '#B00020' }}>{addState.message}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6B7280', marginTop: 6 }}>
              <input
                type="checkbox"
                checked={referralOnlyFilter}
                onChange={(e) => setReferralOnlyFilter(e.target.checked)}
              />
              紹介につながる人のみ表示
            </label>
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
                    <div style={{ fontSize: 13, color: '#1A1A2E' }}>
                      {REFERRAL_SIGNAL_DOT[p.referralSignal || computeReferralSignal(p.accepting_status, p.delegate_list_id)]} {p.name}
                    </div>
                    {p.title && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{p.title}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>ピンは最大3名までです</div>
        )}

        {/* §2-9: RP外のプロの招待(非公開リストでは掲載通知の前提が無いため出さない) */}
        {!isPrivate && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #E5E7EB' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1A2E', marginBottom: 6 }}>
              RP外のプロを追加
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={inviteName[list.id] || ''}
                onChange={(e) => setInviteName((prev) => ({ ...prev, [list.id]: e.target.value.slice(0, 100) }))}
                placeholder="先生のお名前"
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E7EB',
                  fontSize: 13, boxSizing: 'border-box' as const,
                }}
              />
              <button
                onClick={() => createInvite(list.id)}
                disabled={invitingList === list.id || !(inviteName[list.id] || '').trim()}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none',
                  background: '#1A1A2E', color: '#fff', fontSize: 12, fontWeight: 600,
                  cursor: invitingList === list.id ? 'default' : 'pointer',
                  opacity: invitingList === list.id ? 0.6 : 1, flexShrink: 0,
                }}
              >
                招待URLを発行
              </button>
            </div>
            {issuedInviteUrl[list.id] && (
              <div
                onClick={() => copyInviteUrl(list.id, issuedInviteUrl[list.id])}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', background: '#F9FAFB', borderRadius: 8,
                  fontSize: 12, color: '#6B7280', cursor: 'pointer', marginTop: 8,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                  {issuedInviteUrl[list.id]}
                </span>
                <span style={{ color: '#C4A35A', fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
                  {copiedSlug === `invite:${list.id}` ? 'コピーしました' : 'コピー'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* リスト作成 */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '18px 16px', border: '1px solid #E5E7EB' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 10 }}>新しい紹介リストを作る</h3>
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
          まだ紹介リストがありません
        </div>
      ) : (
        <>
          {publicLists.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {publicLists.map((list) => renderListCard(list, false))}
            </div>
          )}

          {privateLists.length > 0 && (
            <div style={{ marginTop: publicLists.length > 0 ? 24 : 0 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 4 }}>
                連携候補（非公開）
              </h3>
              <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12, lineHeight: 1.5 }}>
                共有URLを持たないリストです。招待・掲載通知は行われません。
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {privateLists.map((list) => renderListCard(list, true))}
              </div>
            </div>
          )}
        </>
      )}

      {/* §2-10: 成立した紹介（送り手側の予約一覧・案件スレッド・引き継ぎメモ） */}
      {!sentLoading && sentBookings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>成立した紹介</h3>
          {sentBookings.map((b) => (
            <div key={b.id} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 1.6 }}>
                <strong>{b.client_nickname}さん</strong>
                {b.receiver_pro?.name && <span style={{ color: '#6B7280' }}> → {b.receiver_pro.name}さん</span>}
                <span style={{ marginLeft: 8, fontSize: 11, color: '#9CA3AF' }}>{SENT_STATUS_LABEL[b.status]}</span>
              </div>
              {b.menu_name && <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>メニュー: {b.menu_name}</div>}
              <BookingThread
                bookingId={b.id}
                ownProId={proId}
                isSender={true}
                initialHandoverNote={b.handover_note}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
