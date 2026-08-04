'use client'

import { useEffect, useRef, useState } from 'react'
import { computeReferralSignal, REFERRAL_SIGNAL_DOT } from '@/lib/referral-accepting'

/**
 * CEO追加指示(2026-08-04・タスク1): 「気になるプロ」(非公開referral_list)を
 * ReferralTab(紹介するタブ)から /bookmarks へ移設したコンポーネント。
 * 機能は移設前(ReferralTabのprivateLists分岐)と同じものを維持する(移動のみ・削除しない):
 * ハートで追加した非公開リストの一覧表示・外す(削除)・「紹介リストに追加」(共有リストへ移動/新規作成)・
 * 「＋ プロを追加」(検索して追加)。
 *
 * データ源は既存の /api/referral/lists(GET/POST) と /api/referral/lists/[list_id]/items を
 * そのまま再利用する(新規APIは作らない)。GETはisReferralEnabled()でゲートされているため、
 * 403(先行公開中で未allowlist)の場合はReferralTab側の既存の案内文言と同じ表現でフォールバックする
 * (既存の挙動を変えない)。
 */

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
  has_valid_delegate?: boolean
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

// 実在するlist idと衝突しない固定文字列(「＋新しいリストを作る」選択の番兵値)
const NEW_LIST_SENTINEL = '__new_list__'

export default function BookmarkedProsSection() {
  const [lists, setLists] = useState<ReferralList[]>([])
  const [loading, setLoading] = useState(true)
  // GET /api/referral/lists が403(先行公開中で未allowlist)を返した場合の案内表示用
  const [forbidden, setForbidden] = useState(false)

  // ピン追加UI（リストごとに検索クエリ・結果を保持）
  const [pinQuery, setPinQuery] = useState<Record<string, string>>({})
  const [pinResults, setPinResults] = useState<Record<string, SearchResultPro[]>>({})
  const [pinSearching, setPinSearching] = useState<Record<string, boolean>>({})
  const [pinSearchError, setPinSearchError] = useState<Record<string, boolean>>({})
  const [addingPin, setAddingPin] = useState<string | null>(null)
  const [referralOnlyFilter, setReferralOnlyFilter] = useState(false)
  const [addProPanelOpen, setAddProPanelOpen] = useState<Record<string, boolean>>({})
  const [pinActionError, setPinActionError] = useState<Record<string, string>>({})
  const [pinRemoving, setPinRemoving] = useState<Record<string, boolean>>({})

  // 「紹介リストに追加」(共有リストへ移動/新規作成)
  const [candidatePanelOpen, setCandidatePanelOpen] = useState<Record<string, boolean>>({})
  const [addToListSelection, setAddToListSelection] = useState<Record<string, string>>({})
  const [newListTitleFor, setNewListTitleFor] = useState<Record<string, string>>({})
  const [addToListState, setAddToListState] = useState<
    Record<string, { status: 'loading' | 'success' | 'error'; message?: string; createdListId?: string }>
  >({})

  const searchTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    fetch('/api/referral/lists', { cache: 'no-store' })
      .then((res) => {
        // レビュー指摘(重大2): 403(未allowlist)・401(未認証扱い)はどちらも「この機能を
        // 使えない」ケースとして扱い、後段でreturn null(何も表示しない=allowlist外プロには
        // 従来と完全に同一の画面になる)。
        if (res.status === 403 || res.status === 401) {
          setForbidden(true)
          return null
        }
        return res.ok ? res.json() : null
      })
      .then((data) => {
        if (data?.lists) setLists(data.lists)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const privateLists = lists.filter((l) => l.visibility === 'private')
  const publicLists = lists.filter((l) => l.visibility !== 'private')

  function createListErrorMessage(status: number, errorCode?: string): string {
    if (status === 401) return 'プロアカウントでログインしているか確認してください'
    if (status === 403) return 'まだこの機能の対象アカウントではありません'
    if (status === 400 && errorCode === 'title_required') return 'タイトルを入力してください'
    if (status === 400 && errorCode === 'title_too_long') return 'タイトルが長すぎます（200文字まで）'
    return `作成に失敗しました（コード: ${status || '不明'}）`
  }

  async function postCreateList(
    title: string,
    comment: string | null
  ): Promise<{ ok: boolean; list?: ReferralList; status: number; errorCode?: string }> {
    try {
      const res = await fetch('/api/referral/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ title, comment }),
      })
      if (res.ok) {
        const data = await res.json()
        return { ok: true, list: data.list, status: res.status }
      }
      const body = await res.json().catch(() => ({}))
      console.error('[BookmarkedProsSection] POST /api/referral/lists failed', res.status, body)
      return { ok: false, status: res.status, errorCode: body?.error }
    } catch (err) {
      console.error('[BookmarkedProsSection] POST /api/referral/lists network error', err)
      return { ok: false, status: 0 }
    }
  }

  async function runProSearch(listId: string, query: string, referralOnlyOverride?: boolean) {
    const effectiveReferralOnly = referralOnlyOverride !== undefined ? referralOnlyOverride : referralOnlyFilter
    setPinSearching((prev) => ({ ...prev, [listId]: true }))
    setPinSearchError((prev) => ({ ...prev, [listId]: false }))
    try {
      const url = `/api/referral/pro-search?q=${encodeURIComponent(query)}${effectiveReferralOnly ? '&referral_only=1' : ''}`
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setPinResults((prev) => ({ ...prev, [listId]: data.professionals || [] }))
      } else {
        setPinSearchError((prev) => ({ ...prev, [listId]: true }))
      }
    } catch {
      setPinSearchError((prev) => ({ ...prev, [listId]: true }))
    } finally {
      setPinSearching((prev) => ({ ...prev, [listId]: false }))
    }
  }

  function handleReferralOnlyToggle(checked: boolean) {
    setReferralOnlyFilter(checked)
    Object.entries(pinQuery).forEach(([listId, q]) => {
      const trimmed = q.trim()
      if (trimmed) runProSearch(listId, trimmed, checked)
    })
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
        } else if (err.error === 'target_not_accepting') {
          window.alert('この先生は紹介の受付を停止中です')
        } else if (err.error === 'target_not_in_program') {
          window.alert('この先生はまだ紹介機能の対象ではありません')
        } else {
          window.alert('追加に失敗しました')
        }
      }
    } finally {
      setAddingPin(null)
    }
  }

  async function removePin(listId: string, targetProId: string) {
    const key = `${listId}:${targetProId}`
    setPinActionError((prev) => ({ ...prev, [key]: '' }))
    setPinRemoving((prev) => ({ ...prev, [key]: true }))
    try {
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
      } else {
        setPinActionError((prev) => ({ ...prev, [key]: '外すのに失敗しました' }))
      }
    } catch {
      setPinActionError((prev) => ({ ...prev, [key]: '外すのに失敗しました' }))
    } finally {
      setPinRemoving((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  function effectiveCandidateSelection(key: string): string {
    const sel = addToListSelection[key]
    if (sel === NEW_LIST_SENTINEL) return NEW_LIST_SENTINEL
    if (sel && publicLists.some((l) => l.id === sel)) return sel
    return publicLists[0]?.id || NEW_LIST_SENTINEL
  }

  function toggleCandidatePanel(key: string) {
    setCandidatePanelOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function postCandidatePinToList(targetListId: string, key: string, item: ListItem, createdListId?: string) {
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
              : err.error === 'target_not_accepting'
                ? 'この先生は紹介の受付を停止中です'
                : err.error === 'target_not_in_program'
                  ? 'この先生はまだ紹介機能の対象ではありません'
                  : '追加に失敗しました'
        setAddToListState((prev) => ({ ...prev, [key]: { status: 'error', message, createdListId } }))
      }
    } catch {
      setAddToListState((prev) => ({
        ...prev,
        [key]: { status: 'error', message: '追加に失敗しました', createdListId },
      }))
    }
  }

  async function submitAddCandidateToList(sourceListId: string, item: ListItem) {
    const key = `${sourceListId}:${item.pro_id}`
    const selection = effectiveCandidateSelection(key)

    if (selection !== NEW_LIST_SENTINEL) {
      setAddToListState((prev) => ({ ...prev, [key]: { status: 'loading' } }))
      await postCandidatePinToList(selection, key, item)
      return
    }

    const title = (newListTitleFor[key] || '').trim()
    if (!title) {
      setAddToListState((prev) => ({ ...prev, [key]: { status: 'error', message: 'リストの名前を入力してください' } }))
      return
    }

    const existingCreatedId = addToListState[key]?.createdListId
    setAddToListState((prev) => ({ ...prev, [key]: { status: 'loading', createdListId: existingCreatedId } }))

    let targetList: ReferralList | undefined
    if (existingCreatedId) {
      targetList = lists.find((l) => l.id === existingCreatedId)
      if (!targetList) {
        setAddToListState((prev) => ({
          ...prev,
          [key]: { status: 'error', message: '作成済みリストが見つかりません。画面を再読み込みしてください' },
        }))
        return
      }
    } else {
      const created = await postCreateList(title, null)
      if (!created.ok || !created.list) {
        setAddToListState((prev) => ({
          ...prev,
          [key]: { status: 'error', message: createListErrorMessage(created.status, created.errorCode) },
        }))
        return
      }
      targetList = created.list
      setLists((prev) => [targetList as ReferralList, ...prev])
    }

    await postCandidatePinToList(targetList.id, key, item, targetList.id)
  }

  // レビュー指摘(重大2): 見出し(「気になるプロ」)もこのコンポーネント内に持たせ、
  // ロード中/403(未allowlist)/401はreturn null(何も出さない)にする。
  // ページ側は{isPro && <BookmarkedProsSection />}のみなので、allowlist外プロは
  // 従来(このセクション自体が無かった状態)と完全に同一の画面になる。
  if (loading || forbidden) {
    return null
  }

  if (privateLists.length === 0) {
    return (
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1A1A2E', margin: '0 0 12px 0' }}>
          気になるプロ
        </h2>
        <div style={{ textAlign: 'center', padding: '30px 0', color: '#9CA3AF', fontSize: 13, lineHeight: 1.7 }}>
          まだ気になるプロがいません
          <br />
          プロのプロフィールで「♡ 気になる」を押すとここに追加されます
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1A1A2E', margin: '0 0 12px 0' }}>
        気になるプロ
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {privateLists.map((list) => (
        <div
          key={list.id}
          style={{
            background: '#fff', borderRadius: 14, padding: '16px',
            // CEO追加指示(2026-08-04・タスク3): 確定カードと同系の枠強化
            border: '1.5px solid #E5E7EB',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
        >
          {/* 通常は非公開リストは1本(§3-1の「最古の1本」運用)のため、複数存在する場合のみ
              リスト名を表示して区別できるようにする(機能維持・現状は基本非表示のまま)。
              CEO追加指示(タスク3): クライアント名と同じ17px/fontWeight800に統一。 */}
          {privateLists.length > 1 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 2 }}>リスト名（内部用）</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1A2E' }}>{list.title}</div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {list.items.map((item) => {
              const addKey = `${list.id}:${item.pro_id}`
              const pinError = pinActionError[addKey]
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
                        {item.professionals && (
                          <span style={{ marginRight: 4 }}>
                            {REFERRAL_SIGNAL_DOT[
                              computeReferralSignal(item.professionals.accepting_status, !!item.has_valid_delegate)
                            ]}
                          </span>
                        )}
                        {item.professionals ? (
                          <a href={`/card/${item.pro_id}`} style={{ color: '#1A1A2E', textDecoration: 'none' }}>
                            {item.professionals.name}
                          </a>
                        ) : (
                          '不明なプロ'
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removePin(list.id, item.pro_id)}
                      disabled={!!pinRemoving[addKey]}
                      title="気になるプロから外す"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '2px 4px', lineHeight: 0 }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M12 21s-6.7-4.4-9.3-8.1C.8 10.2 1.5 6.6 4.3 5.2c2.1-1 4.6-.4 6 1.4l1.7 2.1 1.7-2.1c1.4-1.8 3.9-2.4 6-1.4 2.8 1.4 3.5 5 1.6 7.7C18.7 16.6 12 21 12 21z"
                          fill={pinRemoving[addKey] ? 'none' : '#C4A35A'}
                          stroke={pinRemoving[addKey] ? '#C9C4BA' : '#C4A35A'}
                          strokeWidth="1.6"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                  {pinError && (
                    <div style={{ fontSize: 13, color: '#B00020', paddingLeft: 42 }}>{pinError}</div>
                  )}

                  {/* 「紹介リストに追加」(共有リストへ移動/新規作成) */}
                  <div style={{ paddingLeft: 42, minWidth: 0 }}>
                    {addToListState[addKey]?.status === 'success' ? (
                      <div style={{ fontSize: 13, color: '#2E7D32' }}>{addToListState[addKey]?.message}</div>
                    ) : candidatePanelOpen[addKey] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {publicLists.length > 0 && (
                          <select
                            value={effectiveCandidateSelection(addKey)}
                            onChange={(e) => setAddToListSelection((prev) => ({ ...prev, [addKey]: e.target.value }))}
                            style={{
                              padding: '4px 6px', borderRadius: 6, border: '1px solid #E5E7EB',
                              fontSize: 13, color: '#1A1A2E', maxWidth: '100%',
                            }}
                          >
                            {publicLists.map((l) => (
                              <option key={l.id} value={l.id}>{l.title}</option>
                            ))}
                            <option value={NEW_LIST_SENTINEL}>＋ 新しいリストを作る</option>
                          </select>
                        )}
                        {effectiveCandidateSelection(addKey) === NEW_LIST_SENTINEL && (
                          <input
                            value={newListTitleFor[addKey] || ''}
                            onChange={(e) =>
                              setNewListTitleFor((prev) => ({ ...prev, [addKey]: e.target.value.slice(0, 200) }))
                            }
                            placeholder="新しいリストの名前（例: 名古屋圏・めまい/ふらつき）"
                            style={{
                              padding: '6px 8px', borderRadius: 6, border: '1px solid #E5E7EB',
                              fontSize: 13, width: '100%', boxSizing: 'border-box' as const,
                            }}
                          />
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                          <button
                            onClick={() => submitAddCandidateToList(list.id, item)}
                            disabled={addToListState[addKey]?.status === 'loading'}
                            style={{
                              background: 'none', border: '1px solid #C4A35A', color: '#C4A35A',
                              borderRadius: 6, fontSize: 13, fontWeight: 600, padding: '3px 8px',
                              cursor: addToListState[addKey]?.status === 'loading' ? 'default' : 'pointer',
                              opacity: addToListState[addKey]?.status === 'loading' ? 0.6 : 1,
                            }}
                          >
                            {addToListState[addKey]?.status === 'loading'
                              ? '追加中...'
                              : addToListState[addKey]?.status === 'error'
                                ? '再試行する'
                                : '追加する'}
                          </button>
                          <button
                            onClick={() => toggleCandidatePanel(addKey)}
                            style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 13, cursor: 'pointer', padding: 0 }}
                          >
                            キャンセル
                          </button>
                          {addToListState[addKey]?.status === 'error' && (
                            <span style={{ fontSize: 13, color: '#B00020' }}>{addToListState[addKey]?.message}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => toggleCandidatePanel(addKey)}
                        style={{
                          background: 'none', border: '1px solid #C4A35A', color: '#C4A35A',
                          borderRadius: 6, fontSize: 13, fontWeight: 600, padding: '3px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        紹介リストに追加
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ＋ プロを追加(検索して追加。invite/REALPROOF外招待は非公開リストには元々出さない) */}
          {(addProPanelOpen[list.id] || false) === false ? (
            <button
              onClick={() => setAddProPanelOpen((prev) => ({ ...prev, [list.id]: true }))}
              style={{
                background: 'none', border: '1px solid #C4A35A', color: '#C4A35A',
                borderRadius: 8, fontSize: 13, fontWeight: 600, padding: '6px 12px', cursor: 'pointer',
              }}
            >
              ＋ プロを追加
            </button>
          ) : (
            <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 12px', minWidth: 0, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1A2E' }}>プロを追加</span>
                <button
                  onClick={() => setAddProPanelOpen((prev) => ({ ...prev, [list.id]: false }))}
                  style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 13, cursor: 'pointer', padding: 0 }}
                >
                  閉じる
                </button>
              </div>
              <a
                href="/search"
                style={{ fontSize: 13, color: '#C4A35A', fontWeight: 600, textDecoration: 'none', display: 'block', marginBottom: 8 }}
              >
                気になるプロを探して追加 →
              </a>
              <input
                value={pinQuery[list.id] || ''}
                onChange={(e) => searchPro(list.id, e.target.value)}
                placeholder="名前でプロを検索して気になるプロに追加"
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E7EB',
                  fontSize: 13, boxSizing: 'border-box' as const,
                }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6B7280', marginTop: 6 }}>
                <input
                  type="checkbox"
                  checked={referralOnlyFilter}
                  onChange={(e) => handleReferralOnlyToggle(e.target.checked)}
                />
                紹介につながる人のみ表示
              </label>
              {pinSearchError[list.id] && (
                <div style={{ fontSize: 13, color: '#B00020', marginTop: 4 }}>検索に失敗しました</div>
              )}
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
                      onClick={() => (addingPin ? undefined : addPin(list.id, p.id))}
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
                        {REFERRAL_SIGNAL_DOT[p.referralSignal || computeReferralSignal(p.accepting_status, false)]} {p.name}
                      </div>
                      {p.title && <div style={{ fontSize: 13, color: '#9CA3AF' }}>{p.title}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      </div>
    </div>
  )
}
