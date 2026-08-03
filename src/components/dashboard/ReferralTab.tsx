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
  /** §2-2改訂: このピン(professionals)自身が設定しているdelegate_list_idの有効性
   * (承諾済み+受付中のメンバーが1名以上)。APIが一括判定して付与する。 */
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
// §3-0-2(第3弾): 「追加」操作の中で新しいリストを作る選択を表す番兵値(実在するlist idと衝突しない固定文字列)
const NEW_LIST_SENTINEL = '__new_list__'

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
  // レビュー指摘(先行テスト): 作成失敗が無言だった(else無し)ため、失敗を可視化するインラインエラー
  const [createListError, setCreateListError] = useState<string | null>(null)
  // §3-0-2(第3弾): リスト作成フォームは主導線から降格し、一覧の下に折りたたみデフォルトで置く
  const [showCreateForm, setShowCreateForm] = useState(false)

  // §3-1改訂(ゼロ状態導線): リストのタイトルをカード上でインライン編集する最小UI
  const [titleSavingId, setTitleSavingId] = useState<string | null>(null)
  const [titleError, setTitleError] = useState<Record<string, string>>({})
  // §0-7: 保存手段のない入力欄禁止 → onBlur自動保存に「保存しました」の明示フィードバックを追加
  const [titleSavedId, setTitleSavedId] = useState<string | null>(null)
  const [pinNoteSaving, setPinNoteSaving] = useState<Record<string, boolean>>({})
  const [pinNoteSavedKey, setPinNoteSavedKey] = useState<string | null>(null)
  // CEO指摘(先行テスト第3弾): 一言メモはonBlur自動保存をやめ、明示的な保存ボタンで確定する(§0-7)。
  // 下書きはdraftに保持し、保存成功でdraftを消してサーバー値(item.note)表示に戻る。
  const [pinNoteDraft, setPinNoteDraft] = useState<Record<string, string>>({})

  // ピン追加UI（リストごとに検索クエリ・結果を保持）
  const [pinQuery, setPinQuery] = useState<Record<string, string>>({})
  const [pinResults, setPinResults] = useState<Record<string, SearchResultPro[]>>({})
  const [pinSearching, setPinSearching] = useState<Record<string, boolean>>({})
  const [pinSearchError, setPinSearchError] = useState<Record<string, boolean>>({})
  const [addingPin, setAddingPin] = useState<string | null>(null)
  // §2-2改訂: 「紹介につながる人のみ表示」フィルタ(仕様通りデフォルトOFF)
  const [referralOnlyFilter, setReferralOnlyFilter] = useState(false)
  // レビュー指摘(先行テスト): removePin/updatePinNoteが無言failだったため可視化(key=`${listId}:${pro_id}`)
  const [pinActionError, setPinActionError] = useState<Record<string, string>>({})

  // §3-0-2(第3弾・撤回と再指示): 連携候補(private)の各行から共有リストへ追加する導線を復活。
  // 「追加」を押すと選択UI(既存の共有リスト＋「＋新しいリストを作る」)が開く。
  // key = `${sourceListId}:${pro_id}`
  const [candidatePanelOpen, setCandidatePanelOpen] = useState<Record<string, boolean>>({})
  const [addToListSelection, setAddToListSelection] = useState<Record<string, string>>({})
  const [newListTitleFor, setNewListTitleFor] = useState<Record<string, string>>({})
  const [addToListState, setAddToListState] = useState<
    Record<string, { status: 'loading' | 'success' | 'error'; message?: string; createdListId?: string }>
  >({})

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  // §2-9: RP外のプロを招待するフォーム（リストごとに名前入力・発行済みURLを保持）
  const [inviteName, setInviteName] = useState<Record<string, string>>({})
  const [invitingList, setInvitingList] = useState<string | null>(null)
  const [issuedInviteUrl, setIssuedInviteUrl] = useState<Record<string, string>>({})
  // §2-9(第3弾): ネイティブ共有UI。発行時の宛名（1人分の明示用）と編集可能な共有テキストを保持。
  // navigator.share の有無はSSR/ハイドレーション差異を避けるためマウント後に判定する。
  const [issuedInviteName, setIssuedInviteName] = useState<Record<string, string>>({})
  const [inviteShareText, setInviteShareText] = useState<Record<string, string>>({})
  const [canNativeShare, setCanNativeShare] = useState(false)
  useEffect(() => {
    if (typeof navigator !== 'undefined' && typeof (navigator as { share?: unknown }).share === 'function') {
      setCanNativeShare(true)
    }
  }, [])

  // §2-10: 送り手側の成立予約一覧（案件スレッド・引き継ぎメモの入口）
  const [sentBookings, setSentBookings] = useState<SentBooking[]>([])
  const [sentLoading, setSentLoading] = useState(true)

  useEffect(() => {
    fetch('/api/referral/lists', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.lists) {
          setLists(data.lists)
          // R6レビュー指摘: 折りたたみデフォルト閉により、リスト0件の初回ユーザーだけは
          // 作成フォームを最初から開いて見せる(発見性の担保。1件でもあれば閉じたまま)
          if (data.lists.length === 0) setShowCreateForm(true)
        }
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

  // CEO調査更新(先行テスト): POST /api/referral/lists の失敗経路は
  // 401(unauthorized)/403(forbidden)/400(title_required|title_too_long)/500(failed_to_create)の4系統。
  // errorコード別に人間向け文言を出し分ける。
  function createListErrorMessage(status: number, errorCode?: string): string {
    if (status === 401) return 'プロアカウントでログインしているか確認してください'
    // 軽微指摘: env名等の内部実装は画面に出さない(診断情報は console.error 側にある)
    if (status === 403) return 'まだこの機能の対象アカウントではありません'
    if (status === 400 && errorCode === 'title_required') return 'タイトルを入力してください'
    if (status === 400 && errorCode === 'title_too_long') return 'タイトルが長すぎます（200文字まで）'
    return `作成に失敗しました（コード: ${status || '不明'}）`
  }

  // 追加教訓(2026-04): 判別共用体は環境次第で絞り込みに失敗することがあるため、
  // flat型(okはbooleanのみ・list/errorCodeは常にoptional)で返す。
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
      // CEO調査更新: 本番でDevToolsから真因(401/403/400のどれか)を特定できるよう診断ログを残す
      const body = await res.json().catch(() => ({}))
      console.error('[ReferralTab] POST /api/referral/lists failed', res.status, body)
      return { ok: false, status: res.status, errorCode: body?.error }
    } catch (err) {
      console.error('[ReferralTab] POST /api/referral/lists network error', err)
      return { ok: false, status: 0 }
    }
  }

  async function createList() {
    const title = newTitle.trim()
    if (!title) return
    setCreating(true)
    setCreateListError(null)
    const result = await postCreateList(title, newComment.trim() || null)
    if (result.ok && result.list) {
      setLists((prev) => [result.list as ReferralList, ...prev])
      setNewTitle('')
      setNewComment('')
    } else {
      setCreateListError(createListErrorMessage(result.status, result.errorCode))
    }
    setCreating(false)
  }

  async function deleteList(listId: string) {
    if (!window.confirm('このリストを削除しますか？（ピンした先生への通知は解除されます）')) return
    try {
      const res = await fetch(`/api/referral/lists/${listId}`, { method: 'DELETE', cache: 'no-store' })
      if (res.ok) {
        setLists((prev) => prev.filter((l) => l.id !== listId))
      } else {
        window.alert('リストの削除に失敗しました')
      }
    } catch {
      window.alert('リストの削除に失敗しました')
    }
  }

  // 軽微指摘: 入力毎に即fetchせず300msデバウンスする(リストごとにタイマーを保持)
  const searchTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // §0-7: 「保存しました」フィードバックの自動消去タイマー。
  // R6レビュー指摘: タイトル保存とピンの一言保存で1本を共有すると、2秒以内に相互の
  // clearTimeoutを奪い合い表示が消えず居座るため、用途ごとに分ける(アンマウント時にクリーンアップ)
  const titleSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pinNoteSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (titleSavedTimerRef.current) clearTimeout(titleSavedTimerRef.current)
      if (pinNoteSavedTimerRef.current) clearTimeout(pinNoteSavedTimerRef.current)
    }
  }, [])

  // referralOnlyOverride: チェックボックス切替直後の再検索で、setState未反映のstale値を
  // 参照しないよう明示的に渡す（レビュー指摘: チェックボックスの切替が即座に反映されない問題の修正）
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
        // レビュー指摘(先行テスト): 検索失敗が無言(結果0件と見分けがつかない)だったため可視化
        setPinSearchError((prev) => ({ ...prev, [listId]: true }))
      }
    } catch {
      setPinSearchError((prev) => ({ ...prev, [listId]: true }))
    } finally {
      setPinSearching((prev) => ({ ...prev, [listId]: false }))
    }
  }

  // §レビュー指摘: 「紹介につながる人のみ表示」はリストカード間で共有のstateのため、
  // 切替時は入力済み(非空)のクエリを持つ全リストを対象に再検索する(仮決定: リストごとの
  // state分離ではなく、共有のまま全対象再検索する簡潔な方を採用)。
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
          // 🔴2レビュー指摘: allowlist期間中、対象外のプロへのピン追加をブロックした場合の文言
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
        // レビュー指摘(先行テスト): 外す操作の失敗が無言だったため可視化
        setPinActionError((prev) => ({ ...prev, [key]: '外すのに失敗しました' }))
      }
    } catch {
      setPinActionError((prev) => ({ ...prev, [key]: '外すのに失敗しました' }))
    }
  }

  // §3-0-2(第3弾): 連携候補の1行から共有リストへ追加する際の追加先を確定する。
  // 選択が未設定/共有リストが0件の場合は「＋新しいリストを作る」を既定に倒す
  // (共有リスト0件のときは選択UI自体を出さず、その場でリスト名入力へ進める)。
  function effectiveCandidateSelection(key: string): string {
    const sel = addToListSelection[key]
    if (sel === NEW_LIST_SENTINEL) return NEW_LIST_SENTINEL
    if (sel && publicLists.some((l) => l.id === sel)) return sel
    return publicLists[0]?.id || NEW_LIST_SENTINEL
  }

  function toggleCandidatePanel(key: string) {
    setCandidatePanelOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // 実際のピン追加POST。既存リスト・新規作成いずれの経路からも呼ばれる共通処理。
  // createdListId: 新規作成経路の場合、失敗時にリスト自体は作成済みであることを保持し、
  // 再試行でリストを二重作成しないようにする。
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

  // §3-0-2(第3弾): 「追加する」ボタンの実処理。既存の共有リストを選んでいればそのまま追加、
  // 「＋新しいリストを作る」を選んでいればタイトル入力からリスト作成→追加まで1操作で行う。
  // 再試行時の二重リスト作成防止のため、作成済みlist idをaddToListStateに保持する。
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

  async function updateListTitle(listId: string, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return
    setTitleSavingId(listId)
    setTitleError((prev) => ({ ...prev, [listId]: '' }))
    try {
      const res = await fetch(`/api/referral/lists/${listId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ title: trimmed }),
      })
      if (res.ok) {
        setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, title: trimmed } : l)))
        // §0-7: 保存された旨の明示的フィードバック(自動保存に一言添える)
        setTitleSavedId(listId)
        if (titleSavedTimerRef.current) clearTimeout(titleSavedTimerRef.current)
        titleSavedTimerRef.current = setTimeout(() => setTitleSavedId(null), 2000)
      } else {
        setTitleError((prev) => ({ ...prev, [listId]: 'タイトルの更新に失敗しました' }))
      }
    } catch {
      setTitleError((prev) => ({ ...prev, [listId]: 'タイトルの更新に失敗しました' }))
    } finally {
      setTitleSavingId(null)
    }
  }

  async function updatePinNote(listId: string, targetProId: string, note: string): Promise<boolean> {
    const key = `${listId}:${targetProId}`
    // レビュー指摘: サーバー側はtrimして保存するため、楽観更新も同じ値で揃える
    const trimmed = note.trim()
    setPinActionError((prev) => ({ ...prev, [key]: '' }))
    setPinNoteSaving((prev) => ({ ...prev, [key]: true }))
    try {
      const res = await fetch(`/api/referral/lists/${listId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ pro_id: targetProId, note: trimmed }),
      })
      if (res.ok) {
        setLists((prev) =>
          prev.map((l) =>
            l.id === listId
              ? { ...l, items: l.items.map((i) => (i.pro_id === targetProId ? { ...i, note: trimmed } : i)) }
              : l
          )
        )
        // §0-7: 保存された旨の明示的フィードバック
        setPinNoteSavedKey(key)
        if (pinNoteSavedTimerRef.current) clearTimeout(pinNoteSavedTimerRef.current)
        pinNoteSavedTimerRef.current = setTimeout(() => setPinNoteSavedKey(null), 2000)
        return true
      } else {
        // レビュー指摘(先行テスト): 一言メモの保存失敗が無言だったため可視化
        // (失敗時はdraftを保持するため入力値は消えない=データ消失はしない)
        setPinActionError((prev) => ({ ...prev, [key]: '一言の保存に失敗しました' }))
        return false
      }
    } catch {
      setPinActionError((prev) => ({ ...prev, [key]: '一言の保存に失敗しました' }))
      return false
    } finally {
      setPinNoteSaving((prev) => ({ ...prev, [key]: false }))
    }
  }

  async function createInvite(listId: string) {
    const name = (inviteName[listId] || '').trim()
    if (!name) return
    setInvitingList(listId)
    // レビュー指摘: 再発行時に前回のURL・宛名・共有テキストが残ると「新しい宛名で古い1人分URLを
    // 送る」事故の余地があるため、発行開始時に当該リスト分をクリアする
    setIssuedInviteUrl((prev) => { const next = { ...prev }; delete next[listId]; return next })
    setIssuedInviteName((prev) => { const next = { ...prev }; delete next[listId]; return next })
    setInviteShareText((prev) => { const next = { ...prev }; delete next[listId]; return next })
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
          // §2-9(第3弾): 宛名(1人分の明示)と、編集可能な共有テキストの初期値をセットする
          setIssuedInviteName((prev) => ({ ...prev, [listId]: name }))
          setInviteShareText((prev) => ({
            ...prev,
            [listId]: `REALPROOFという、施術の実績が記録として残るサービスを使っています。\n信頼できる連携先として登録したいので、よければプロフィールを作ってもらえませんか。→ ${data.invite_url}`,
          }))
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

  // §2-9(第3弾): 共有テキスト(URL入り)ごと共有/コピーする。shareのキャンセル(AbortError)は無視。
  async function shareInviteText(listId: string) {
    const text = inviteShareText[listId] || issuedInviteUrl[listId]
    if (!text) return
    try {
      await (navigator as { share: (data: { text: string }) => Promise<void> }).share({ text })
    } catch {}
  }

  function copyInviteShareText(listId: string) {
    const text = inviteShareText[listId] || issuedInviteUrl[listId]
    if (!text) return
    navigator.clipboard?.writeText(text).then(() => {
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* §3-1改訂: タイトルのインライン編集(既存PATCH /api/referral/lists/[list_id] を利用)。
                連携候補(private)はタイトルが移行SQLの冪等ガードにも使われるため表示のみ(軽微指摘)。 */}
            {isPrivate ? (
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>{list.title}</div>
            ) : (
              <input
                defaultValue={list.title}
                onBlur={(e) => {
                  const trimmed = e.target.value.trim()
                  if (!trimmed) {
                    // 軽微指摘: 空欄blurを無言にしない。旧タイトルへ戻して1行知らせる
                    e.target.value = list.title
                    setTitleError((prev) => ({ ...prev, [list.id]: 'タイトルは空にできません' }))
                    return
                  }
                  if (trimmed !== list.title) {
                    updateListTitle(list.id, trimmed)
                  }
                }}
                style={{
                  fontSize: 15, fontWeight: 700, color: '#1A1A2E', border: 'none', background: 'transparent',
                  padding: 0, width: '100%', fontFamily: 'inherit', outline: 'none',
                }}
              />
            )}
            {titleSavingId === list.id && (
              <div style={{ fontSize: 10, color: '#9CA3AF' }}>保存中...</div>
            )}
            {titleSavedId === list.id && (
              <div style={{ fontSize: 10, color: '#2E7D32' }}>保存しました</div>
            )}
            {titleError[list.id] && (
              <div style={{ fontSize: 10, color: '#B00020' }}>{titleError[list.id]}</div>
            )}
            {list.comment && (
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4, lineHeight: 1.5 }}>{list.comment}</div>
            )}
          </div>
          <button
            onClick={() => deleteList(list.id)}
            style={{ background: 'none', border: 'none', color: '#B00020', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
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
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, minWidth: 0 }}>
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
                      {item.professionals?.name || '不明なプロ'}
                    </div>
                    {!isPrivate && <div style={{ fontSize: 11, color: label.color }}>{label.text}</div>}
                    {/* CEO指摘(先行テスト第3弾): 一言メモは共有リストのみ(気になるプロ=privateには不要)。
                        onBlur自動保存をやめ、変更時に出る「保存する」ボタンで確定する(§0-7) */}
                    {!isPrivate && (
                      <>
                        <input
                          value={pinNoteDraft[addKey] !== undefined ? pinNoteDraft[addKey] : (item.note || '')}
                          onChange={(e) => setPinNoteDraft((prev) => ({ ...prev, [addKey]: e.target.value.slice(0, 200) }))}
                          placeholder="一言（例: 産後のケアが得意です）"
                          style={{
                            width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E7EB',
                            fontSize: 12, marginTop: 4, boxSizing: 'border-box' as const,
                          }}
                        />
                        {pinNoteDraft[addKey] !== undefined && pinNoteDraft[addKey] !== (item.note || '') && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <button
                              onClick={async () => {
                                const ok = await updatePinNote(list.id, item.pro_id, pinNoteDraft[addKey])
                                if (ok) {
                                  setPinNoteDraft((prev) => {
                                    const next = { ...prev }
                                    delete next[addKey]
                                    return next
                                  })
                                }
                              }}
                              disabled={!!pinNoteSaving[addKey]}
                              style={{
                                padding: '4px 12px', borderRadius: 6, border: 'none',
                                background: '#1A1A2E', color: '#fff', fontSize: 11, fontWeight: 600,
                                cursor: pinNoteSaving[addKey] ? 'default' : 'pointer',
                                opacity: pinNoteSaving[addKey] ? 0.6 : 1,
                              }}
                            >
                              {pinNoteSaving[addKey] ? '保存中...' : '保存する'}
                            </button>
                            <button
                              onClick={() =>
                                setPinNoteDraft((prev) => {
                                  const next = { ...prev }
                                  delete next[addKey]
                                  return next
                                })
                              }
                              style={{
                                background: 'none', border: 'none', color: '#9CA3AF',
                                fontSize: 11, cursor: 'pointer', padding: 0,
                              }}
                            >
                              キャンセル
                            </button>
                          </div>
                        )}
                        {pinNoteSavedKey === addKey && (
                          <div style={{ fontSize: 10, color: '#2E7D32', marginTop: 2 }}>保存しました</div>
                        )}
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => removePin(list.id, item.pro_id)}
                    style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                  >
                    外す
                  </button>
                </div>
                {/* レビュー指摘(先行テスト): 外す/一言保存の失敗を可視化 */}
                {pinError && (
                  <div style={{ fontSize: 11, color: '#B00020', paddingLeft: 42 }}>{pinError}</div>
                )}

                {/* §3-0-2(第3弾・撤回と再指示): 連携候補(private)行から共有リストへ追加する導線を復活。
                    「追加」を押すと、既存の共有リスト一覧＋「＋新しいリストを作る」の選択が開く。
                    共有リストが0件なら選択UIを出さず最初から新規作成入力を出す。 */}
                {isPrivate && (
                  <div style={{ paddingLeft: 42, minWidth: 0 }}>
                    {addToListState[addKey]?.status === 'success' ? (
                      <div style={{ fontSize: 11, color: '#2E7D32' }}>{addToListState[addKey]?.message}</div>
                    ) : candidatePanelOpen[addKey] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {publicLists.length > 0 && (
                          <select
                            value={effectiveCandidateSelection(addKey)}
                            onChange={(e) => setAddToListSelection((prev) => ({ ...prev, [addKey]: e.target.value }))}
                            style={{
                              padding: '4px 6px', borderRadius: 6, border: '1px solid #E5E7EB',
                              fontSize: 11, color: '#1A1A2E', maxWidth: '100%',
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
                              fontSize: 11, width: '100%', boxSizing: 'border-box' as const,
                            }}
                          />
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                          <button
                            onClick={() => submitAddCandidateToList(list.id, item)}
                            disabled={addToListState[addKey]?.status === 'loading'}
                            style={{
                              background: 'none', border: '1px solid #C4A35A', color: '#C4A35A',
                              borderRadius: 6, fontSize: 11, fontWeight: 600, padding: '3px 8px',
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
                            style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 11, cursor: 'pointer', padding: 0 }}
                          >
                            キャンセル
                          </button>
                          {addToListState[addKey]?.status === 'error' && (
                            <span style={{ fontSize: 11, color: '#B00020' }}>{addToListState[addKey]?.message}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => toggleCandidatePanel(addKey)}
                        style={{
                          background: 'none', border: '1px solid #C4A35A', color: '#C4A35A',
                          borderRadius: 6, fontSize: 11, fontWeight: 600, padding: '3px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        紹介リストに追加
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ピン追加 */}
        {/* 🟡5レビュー指摘: declined(辞退)はサーバー側(items/route.ts)同様に枠を占有しないため
            カウントから除外する(consent_status!=='declined') */}
        {(isPrivate || list.items.filter((i) => i.consent_status !== 'declined').length < MAX_PINS) ? (
          <div style={{ position: 'relative' }}>
            {/* §3-0-2: プロを探す導線は/searchを転用する。リストカード内の独自ピッカーは作らず、
                /searchの結果カードから直接このリストへ追加できる(SearchPageClient側の実装)。 */}
            <a
              href="/search"
              style={{
                fontSize: 12, color: '#C4A35A', fontWeight: 600, textDecoration: 'none',
                display: 'inline-block', marginBottom: 8,
              }}
            >
              プロを探して追加 →
            </a>
            <input
              value={pinQuery[list.id] || ''}
              onChange={(e) => searchPro(list.id, e.target.value)}
              placeholder={isPrivate ? '名前でプロを検索して気になるプロに追加' : '名前でプロを検索してピン追加（最大3名）'}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E7EB',
                fontSize: 13, boxSizing: 'border-box' as const,
              }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6B7280', marginTop: 6 }}>
              <input
                type="checkbox"
                checked={referralOnlyFilter}
                onChange={(e) => handleReferralOnlyToggle(e.target.checked)}
              />
              紹介につながる人のみ表示
            </label>
            {/* レビュー指摘(先行テスト): 検索失敗が「結果0件」と見分けがつかず無言だったため可視化 */}
            {pinSearchError[list.id] && (
              <div style={{ fontSize: 11, color: '#B00020', marginTop: 4 }}>検索に失敗しました</div>
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
                      {/* p.referralSignalはAPI側で有効性判定済みで常に返るため、フォールバックは
                          防御的なもの(未知の応答形状時はfalse=保守側に倒す) */}
                      {REFERRAL_SIGNAL_DOT[p.referralSignal || computeReferralSignal(p.accepting_status, false)]} {p.name}
                    </div>
                    {p.title && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{p.title}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          !isPrivate && (
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>ピンは最大3名までです</div>
          )
        )}

        {/* §2-9: RP外のプロの招待(非公開リストでは掲載通知の前提が無いため出さない) */}
        {!isPrivate && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #E5E7EB' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1A2E', marginBottom: 6 }}>
              RP外のプロを追加
            </div>
            {/* CEO指摘(先行テスト): 入力とボタンの横並びがスマホ幅(360〜390px)で横スクロールの
                原因になっていたため縦積みにする */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              <input
                value={inviteName[list.id] || ''}
                onChange={(e) => setInviteName((prev) => ({ ...prev, [list.id]: e.target.value.slice(0, 100) }))}
                placeholder="先生のお名前"
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E7EB',
                  fontSize: 13, boxSizing: 'border-box' as const,
                }}
              />
              <button
                onClick={() => createInvite(list.id)}
                disabled={invitingList === list.id || !(inviteName[list.id] || '').trim()}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none', alignSelf: 'flex-start' as const,
                  background: '#1A1A2E', color: '#fff', fontSize: 12, fontWeight: 600,
                  cursor: invitingList === list.id ? 'default' : 'pointer',
                  opacity: invitingList === list.id ? 0.6 : 1,
                }}
              >
                招待URLを発行
              </button>
            </div>
            {/* §2-9(第3弾): 発行後はURL単体でなく「編集できる共有テキスト＋ネイティブ共有/コピー」を出す。
                1人分(single-use)であることを宛名付きで明示する(§0-6: 絵文字なし・静かな表示) */}
            {issuedInviteUrl[list.id] && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column' as const, gap: 6, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#8A6D1F', lineHeight: 1.6 }}>
                  この招待URLは1人分です（{issuedInviteName[list.id] ? `${issuedInviteName[list.id]}先生用` : 'お相手の先生専用'}）。別の先生には新しいURLを発行してください
                </div>
                <textarea
                  value={inviteShareText[list.id] || ''}
                  onChange={(e) => setInviteShareText((prev) => ({ ...prev, [list.id]: e.target.value }))}
                  style={{
                    width: '100%', minHeight: 88, padding: '8px 10px', borderRadius: 8,
                    border: '1px solid #E5E7EB', fontSize: 12, color: '#374151',
                    boxSizing: 'border-box' as const, resize: 'vertical' as const, lineHeight: 1.6,
                  }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  {canNativeShare && (
                    <button
                      onClick={() => shareInviteText(list.id)}
                      style={{
                        padding: '8px 14px', borderRadius: 8, border: 'none',
                        background: '#1A1A2E', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      共有する（LINE・メール等）
                    </button>
                  )}
                  <button
                    onClick={() => copyInviteShareText(list.id)}
                    style={{
                      padding: '8px 14px', borderRadius: 8, border: '1px solid #E5E7EB',
                      background: '#fff', color: '#1A1A2E', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {copiedSlug === `invite:${list.id}` ? 'コピーしました' : 'テキストをコピー'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
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
                気になるプロ（非公開）
              </h3>
              <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12, lineHeight: 1.5 }}>
                共有URLを持たないリストです。招待・掲載通知は行われません。各行の「紹介リストに追加」から共有リストにも追加できます。
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {privateLists.map((list) => renderListCard(list, true))}
              </div>
            </div>
          )}
        </>
      )}

      {/* リスト作成(§3-0-2第3弾: 主導線から降格。一覧の下・折りたたみデフォルト) */}
      <div style={{ background: '#fff', borderRadius: 14, padding: showCreateForm ? '18px 16px' : '12px 16px', border: '1px solid #E5E7EB' }}>
        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            style={{ background: 'none', border: 'none', color: '#C4A35A', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}
          >
            ＋ リストを直接作る
          </button>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>
                {/* 先行テスト指摘C: 公開リストが0件の間は「最初の1件」であることを明示する */}
                {publicLists.length === 0 ? '最初の紹介リストを作りましょう' : '新しい紹介リストを作る'}
              </h3>
              <button
                onClick={() => setShowCreateForm(false)}
                style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
              >
                閉じる
              </button>
            </div>
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
            {/* 先行テストB: disabledなだけだと「押したのに無反応」に見えるため、理由を明示する */}
            {!creating && !newTitle.trim() && (
              <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 10 }}>
                タイトルを入力すると作成できます
              </span>
            )}
            {/* レビュー指摘(先行テスト): 作成失敗(403含む)が無言だったため可視化 */}
            {createListError && (
              <div style={{ fontSize: 11, color: '#B00020', marginTop: 8, lineHeight: 1.6 }}>{createListError}</div>
            )}
          </>
        )}
      </div>

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
