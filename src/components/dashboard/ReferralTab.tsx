'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import BookingThread from '@/components/dashboard/BookingThread'
import ReferralCompletedList from '@/components/dashboard/ReferralCompletedList'
import { computeReferralSignal, REFERRAL_SIGNAL_DOT } from '@/lib/referral-accepting'
import { estimateReferralPayoutReflectionText } from '@/lib/referral-format'

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

/** ステージ4(送り手分配・CEO決定): /api/referral/payouts が返す分配行(PIIなし・client_nicknameのみ)。 */
interface SentPayout {
  id: string
  booking_id: string
  amount_jpy: number
  status: 'pending' | 'paid' | 'cancelled'
  created_at: string
  paid_at: string | null
  /** 報酬表示の再設計(CEO指示・2026-08-05): お支払い履歴に「◯◯さんの紹介」を表示するため。 */
  client_nickname: string | null
}

const SENT_STATUS_LABEL: Record<SentBooking['status'], string> = {
  requested: 'リクエスト中',
  confirmed: '確定',
  completed: '完了',
  cancelled: '辞退・キャンセル',
  expired: '失効',
}

/** 報酬表示の再設計(CEO指示・2026-08-05): お支払い履歴の日付表示「YYYY/M/D」(Asia/Tokyo)。無効値は空文字。 */
function formatPayoutDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}/${get('month')}/${get('day')}`
}

const MAX_PINS = 3
const SHARE_ORIGIN = 'https://realproof.jp'
// §3-0-2(第3弾): 「追加」操作の中で新しいリストを作る選択を表す番兵値(実在するlist idと衝突しない固定文字列)
const NEW_LIST_SENTINEL = '__new_list__'

interface Props {
  proId: string
  /** CEO指示(2026-08-04・IA再変更): サブタブ「受ける/する/紹介した案件」の3つのうちどれを
   * 表示するか。lists/sentBookingsのfetchは1回だけ(既存のまま)行い、表示はCSSで切り替える
   * (subtab切替時の再フェッチ・二重マウントを避ける)。 */
  subtab: 'receive' | 'send' | 'cases'
  /** 「紹介を受ける」タブの空状態判定用に、完了した紹介(受け手側)の件数と読み込み完了フラグを
   * 親へ通知する(レビュー指摘・軽微7: loadedを渡し到着順による空状態フラッシュを防ぐ)。 */
  onCompletedCountChange?: (count: number, loaded: boolean) => void
  /** CEO指示(2026-08-04・IA再変更): 「紹介した案件」タブの件数バッジ(進行中=requested/confirmed)・
   * 空状態判定用に、送り手側の集計を親へ通知する。 */
  onSentStatusChange?: (info: { activeCount: number; totalCount: number; loaded: boolean }) => void
}

export default function ReferralTab({ proId, subtab, onCompletedCountChange, onSentStatusChange }: Props) {
  // リスト一覧
  const [lists, setLists] = useState<ReferralList[]>([])
  const [listsLoading, setListsLoading] = useState(true)

  // 新規リスト作成フォーム
  const [newTitle, setNewTitle] = useState('')
  // CEO指示(先行テスト第3弾): クライアントへのメッセージは従来の既定文をデフォルトで充填し、
  // 送り手が書き換えられるようにする(/r/側の未設定フォールバックと同一文)
  const DEFAULT_CLIENT_MESSAGE = 'ご紹介した後も、あなたの経過は私自身が伺っていきます。安心してご相談ください。'
  const [newComment, setNewComment] = useState(DEFAULT_CLIENT_MESSAGE)
  const [creating, setCreating] = useState(false)
  // レビュー指摘(先行テスト): 作成失敗が無言だった(else無し)ため、失敗を可視化するインラインエラー
  const [createListError, setCreateListError] = useState<string | null>(null)
  // §3-0-2(第3弾): リスト作成フォームは主導線から降格し、一覧の下に折りたたみデフォルトで置く
  // CEO追加指示(2026-08-04・タスク4): 入口を「プロを追加して作る」「タイトルから作る」の2択に
  // メニュー化。'closed'=トリガーのみ / 'menu'=2択 / 'title_form'=既存フォーム(旧showCreateForm) /
  // 'pick_pro'=最初のプロを選ぶとリストを自動作成するUI。
  const [createEntryMode, setCreateEntryMode] = useState<'closed' | 'menu' | 'title_form' | 'pick_pro'>('closed')
  // 「プロを追加して作る」中の検索state用の番兵キー(pinQuery/pinResults等は既存の
  // Record<listId,...>をそのまま再利用する。実在するlist idと衝突しない固定文字列)。
  const NEW_LIST_PICK_KEY = '__new_list_pick__'
  const [creatingFromPro, setCreatingFromPro] = useState(false)
  // レビュー指摘(軽微2): stateの反映を待たない同期ロック(連打二重作成防止)。
  const creatingFromProRef = useRef(false)
  // 作成直後のリストへスクロール/「リスト名を変更できます」ヒント表示用
  const [justCreatedListId, setJustCreatedListId] = useState<string | null>(null)
  // レビュー指摘(軽微1): 成功/失敗でヒント文言を変える(alertとの矛盾解消)
  const [justCreatedHintMessage, setJustCreatedHintMessage] = useState('')
  const justCreatedHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listCardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // §3-1改訂(ゼロ状態導線): リストのタイトルをカード上でインライン編集する最小UI
  const [titleSavingId, setTitleSavingId] = useState<string | null>(null)
  const [titleError, setTitleError] = useState<Record<string, string>>({})
  // §0-7: 保存手段のない入力欄禁止 → onBlur自動保存に「保存しました」の明示フィードバックを追加
  const [titleSavedId, setTitleSavedId] = useState<string | null>(null)
  // CEO指摘(先行テスト第3弾): クライアントへのメッセージ(comment)の後から編集UI
  const [commentEditingId, setCommentEditingId] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSavingId, setCommentSavingId] = useState<string | null>(null)
  const [commentSavedId, setCommentSavedId] = useState<string | null>(null)
  const [commentError, setCommentError] = useState<Record<string, string>>({})
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
  // CEO指摘(先行テスト・UI修正③): プロ追加の3導線(探して追加/名前で追加/REALPROOF外を招待)を
  // 「＋ プロを追加」ボタン1つに集約し、押した時だけ展開する(listIdごとの排他state)。
  const [addProPanel, setAddProPanel] = useState<Record<string, 'closed' | 'menu' | 'name_search' | 'invite'>>({})
  // レビュー指摘(先行テスト): removePin/updatePinNoteが無言failだったため可視化(key=`${listId}:${pro_id}`)
  const [pinActionError, setPinActionError] = useState<Record<string, string>>({})
  // CEO指示(先行テスト第3弾): ハートのタップ即時フィードバック(色抜き)用(key同上)
  const [pinRemoving, setPinRemoving] = useState<Record<string, boolean>>({})

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
  // CEO指摘(先行テスト・UI修正②): クライアントに共有するURLをQRコード表示するモーダル(listId単位)
  const [qrModalListId, setQrModalListId] = useState<string | null>(null)

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

  // ステージ4(送り手分配・CEO決定): 「紹介した案件」タブの報酬サマリー・案件ごとの確定表示用
  const [sentPayouts, setSentPayouts] = useState<SentPayout[]>([])
  const [sentPayoutsLoaded, setSentPayoutsLoaded] = useState(false)
  // レビュー指摘(軽微8): サマリー合計はサーバー側集計値(全件対象)を使う(一覧の直近500件には依存しない)
  const [sentPayoutsPendingTotalJpy, setSentPayoutsPendingTotalJpy] = useState(0)
  const [sentPayoutsPaidTotalJpy, setSentPayoutsPaidTotalJpy] = useState(0)
  // 報酬表示の再設計(CEO指示・2026-08-05): お支払い履歴は直近10件のみ表示し、「もっと見る」で全件展開する。
  const [payoutHistoryExpanded, setPayoutHistoryExpanded] = useState(false)

  useEffect(() => {
    fetch('/api/referral/lists', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.lists) {
          setLists(data.lists)
          // R6レビュー指摘: 折りたたみデフォルト閉により、リスト0件の初回ユーザーだけは
          // 作成メニューを最初から開いて見せる(発見性の担保。1件でもあれば閉じたまま)。
          // レビュー指摘(重大1): 気になるプロ(private)は/bookmarksへ移設済みでこのタブには
          // 表示しないため、判定はpublic(共有)リストの件数だけで行う。
          const publicCount = (data.lists as Array<{ visibility: string }>).filter(
            (l) => l.visibility !== 'private'
          ).length
          if (publicCount === 0) setCreateEntryMode('menu')
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

  // ステージ4(送り手分配・CEO決定): 分配台帳(referral_payouts)は別APIで取得する(fail-soft・
  // migration 039未実行の環境では空配列/0円が返るだけで、このタブの他表示を壊さない)。
  useEffect(() => {
    fetch('/api/referral/payouts', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.payouts) setSentPayouts(data.payouts)
        if (typeof data?.pending_total_jpy === 'number') setSentPayoutsPendingTotalJpy(data.pending_total_jpy)
        if (typeof data?.paid_total_jpy === 'number') setSentPayoutsPaidTotalJpy(data.paid_total_jpy)
      })
      .catch(() => {})
      .finally(() => setSentPayoutsLoaded(true))
  }, [])

  // ステージ4「Stripe Connect 口座登録導線」(CEO承認済み・2026-08-04): 受け取り口座の登録状況。
  // Stripeのreturn_urlは同URLへのフルナビゲーションのため、戻り時はこのコンポーネントが
  // 再マウントされ自然に最新状態を取得できる。
  const [connectStatus, setConnectStatus] = useState<
    'none' | 'pending' | 'reviewing' | 'enabled' | 'not_ready' | null
  >(null)
  const [connectStatusLoaded, setConnectStatusLoaded] = useState(false)
  const [connectOnboarding, setConnectOnboarding] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  // レビュー指摘(軽微9): 「紹介した案件」サブタブを開いた時だけStripe APIを呼ぶ(他サブタブ
  // 表示中の無駄な呼び出しを防ぐ)。subtabはCSS切替のみで再マウントされないため、初回に
  // cases になった時だけ1回fetchするようrefで制御する(依存はsubtab文字列のみ)。
  const connectStatusFetchedRef = useRef(false)
  useEffect(() => {
    if (subtab !== 'cases' || connectStatusFetchedRef.current) return
    connectStatusFetchedRef.current = true
    fetch('/api/referral/connect/status', { cache: 'no-store' })
      .then((res) => {
        if (res.status === 503) return { status: 'not_ready' }
        return res.ok ? res.json() : null
      })
      .then((data) => {
        if (data?.status) setConnectStatus(data.status)
      })
      .catch(() => {})
      .finally(() => setConnectStatusLoaded(true))
  }, [subtab])

  const handleConnectOnboard = async () => {
    setConnectOnboarding(true)
    setConnectError(null)
    try {
      const res = await fetch('/api/referral/connect/onboard', { method: 'POST', cache: 'no-store' })
      if (res.status === 503) {
        setConnectStatus('not_ready')
        setConnectOnboarding(false)
        return
      }
      const data = await res.json().catch(() => null)
      if (res.ok && data?.url) {
        window.location.href = data.url
        return
      }
      setConnectError('口座登録の開始に失敗しました。しばらくしてから再度お試しください。')
    } catch {
      setConnectError('口座登録の開始に失敗しました。しばらくしてから再度お試しください。')
    }
    setConnectOnboarding(false)
  }

  // CEO指示(2026-08-04・IA再変更): 「紹介した案件」タブの件数バッジ(進行中)・空状態判定用に
  // 集計結果を親へ通知する。依存はプリミティブのみ(件数・boolean)。
  const sentActiveCount = sentBookings.filter((b) => b.status === 'requested' || b.status === 'confirmed').length
  const sentTotalCount = sentBookings.length
  useEffect(() => {
    onSentStatusChange?.({ activeCount: sentActiveCount, totalCount: sentTotalCount, loaded: !sentLoading })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentActiveCount, sentTotalCount, sentLoading])

  // CEO追加指示(タスク4): 作成直後のリストへスクロールする(依存はプリミティブのみ)。
  useEffect(() => {
    if (!justCreatedListId) return
    const el = listCardRefs.current[justCreatedListId]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [justCreatedListId])

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

  // CEO追加指示(タスク4): 呼び出し元(title_form)が成功時だけメニューを閉じられるよう、
  // 成否をboolean戻り値で返す(既存の内部ロジックは変更しない)。
  async function createList(): Promise<boolean> {
    const title = newTitle.trim()
    if (!title) return false
    setCreating(true)
    setCreateListError(null)
    const result = await postCreateList(title, newComment.trim() || null)
    if (result.ok && result.list) {
      setLists((prev) => [result.list as ReferralList, ...prev])
      setNewTitle('')
      setNewComment(DEFAULT_CLIENT_MESSAGE)
      setCreating(false)
      return true
    }
    setCreateListError(createListErrorMessage(result.status, result.errorCode))
    setCreating(false)
    return false
  }

  // CEO追加指示(2026-08-04・タスク4): 「プロを追加して作る」経路。最初のプロを選んだ時点で
  // リストを自動作成(内部用タイトルは「新しいリスト」+日付・クライアントメッセージは既存の
  // デフォルト文・作成APIは既存のpostCreateListを使用)→選んだプロを追加、の2ステップを
  // 1操作で行う。DB INSERTはリスト作成1回・アイテム追加1回(pending→後更新パターンではない)。
  async function createListFromPro(pro: SearchResultPro) {
    // レビュー指摘(軽微2): stateの再レンダー反映を待たずに連打されると二重作成しうるため、
    // 同期的なrefロックを先頭で確認する(finallyで必ず解除)。
    if (creatingFromProRef.current) return
    creatingFromProRef.current = true
    setCreatingFromPro(true)
    const todayLabel = new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
    const defaultTitle = `新しいリスト(${todayLabel})`
    const created = await postCreateList(defaultTitle, DEFAULT_CLIENT_MESSAGE)
    if (!created.ok || !created.list) {
      window.alert(createListErrorMessage(created.status, created.errorCode))
      setCreatingFromPro(false)
      creatingFromProRef.current = false
      return
    }
    const newList = created.list
    setLists((prev) => [newList, ...prev])
    // レビュー指摘(軽微1): items POSTの成否を保持し、alertの文言と矛盾しないヒントを出す。
    let itemAdded = false
    try {
      const res = await fetch(`/api/referral/lists/${newList.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ pro_id: pro.id }),
      })
      if (res.ok) {
        const data = await res.json()
        setLists((prev) =>
          prev.map((l) => (l.id === newList.id ? { ...l, items: [...l.items, { ...data.item, professionals: pro }] } : l))
        )
        itemAdded = true
      } else {
        const err = await res.json().catch(() => ({}))
        window.alert(
          err.error === 'target_not_accepting'
            ? 'この先生は紹介の受付を停止中です（リストは作成されています）'
            : 'プロの追加に失敗しました（リストは作成されています。あとから追加できます）'
        )
      }
    } catch {
      window.alert('プロの追加に失敗しました（リストは作成されています。あとから追加できます）')
    } finally {
      setCreatingFromPro(false)
      creatingFromProRef.current = false
      setCreateEntryMode('closed')
      setPinQuery((prev) => ({ ...prev, [NEW_LIST_PICK_KEY]: '' }))
      setPinResults((prev) => ({ ...prev, [NEW_LIST_PICK_KEY]: [] }))
      setJustCreatedListId(newList.id)
      setJustCreatedHintMessage(
        itemAdded ? 'プロを追加しました。リスト名を変更できます' : 'リストを作成しました。リスト名を変更できます'
      )
      if (justCreatedHintTimerRef.current) clearTimeout(justCreatedHintTimerRef.current)
      justCreatedHintTimerRef.current = setTimeout(() => setJustCreatedListId(null), 8000)
    }
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
  const commentSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (titleSavedTimerRef.current) clearTimeout(titleSavedTimerRef.current)
      if (pinNoteSavedTimerRef.current) clearTimeout(pinNoteSavedTimerRef.current)
      if (commentSavedTimerRef.current) clearTimeout(commentSavedTimerRef.current)
      if (justCreatedHintTimerRef.current) clearTimeout(justCreatedHintTimerRef.current)
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
    // CEO指示(先行テスト第3弾): タップ即時にハートの色を抜く(視覚フィードバック)。
    // 失敗時は色を戻してエラー表示する。
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
        // レビュー指摘(先行テスト): 外す操作の失敗が無言だったため可視化
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

  // CEO指摘(先行テスト第3弾): comment=「クライアントへのメッセージ」(紹介ページの
  // 「先生からのメッセージ」本文)。作成後もここから変更できる(§0-7: 保存ボタンで確定)。
  async function updateListComment(listId: string, comment: string): Promise<boolean> {
    const trimmed = comment.trim()
    setCommentSavingId(listId)
    setCommentError((prev) => ({ ...prev, [listId]: '' }))
    try {
      const res = await fetch(`/api/referral/lists/${listId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ comment: trimmed || null }),
      })
      if (res.ok) {
        setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, comment: trimmed || null } : l)))
        setCommentSavedId(listId)
        if (commentSavedTimerRef.current) clearTimeout(commentSavedTimerRef.current)
        commentSavedTimerRef.current = setTimeout(() => setCommentSavedId(null), 2000)
        return true
      }
      setCommentError((prev) => ({ ...prev, [listId]: 'メッセージの更新に失敗しました' }))
      return false
    } catch {
      setCommentError((prev) => ({ ...prev, [listId]: 'メッセージの更新に失敗しました' }))
      return false
    } finally {
      setCommentSavingId(null)
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
          // CEO決定(先行テスト第3弾・案B): 業種を限定しない語彙(§0-3)＋紹介目的の明言＋宛名入り
          setInviteShareText((prev) => ({
            ...prev,
            [listId]: `${name}先生をぜひ私の「紹介リスト」に載せたく、ご連絡しました。\nREALPROOFという、クライアントからの評価が実績として記録に残るサービスです。\nよければプロフィールを作ってもらえませんか → ${data.invite_url}`,
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

  // CEO指摘(先行テスト・UI修正②): navigator.shareでクライアントに共有するURLを共有する。
  // キャンセル(AbortError)は既存のshareInviteTextと同様に握り潰す。
  async function shareListUrl(slug: string) {
    const url = `${SHARE_ORIGIN}/r/${slug}`
    try {
      await (navigator as { share: (data: { url: string }) => Promise<void> }).share({ url })
    } catch {}
  }

  // CEO指摘(先行テスト・UI修正③): 「＋ プロを追加」の展開/折りたたみ(排他: 押すと閉じる)
  function toggleAddProPanel(listId: string) {
    setAddProPanel((prev) => ({
      ...prev,
      [listId]: prev[listId] && prev[listId] !== 'closed' ? 'closed' : 'menu',
    }))
  }

  const consentLabel = (status: 'pending' | 'approved' | 'declined') => {
    if (status === 'approved') return { text: '承諾済み', color: '#2E7D32' }
    if (status === 'declined') return { text: '辞退されました', color: '#B00020' }
    return { text: '承諾待ち', color: '#B8860B' }
  }

  // §3-2/中1: visibility='private' は「連携候補（非公開）」= 共有URLを持たない社内向けリスト。
  // 共有URLコピー・招待UI・承諾待ちバッジ(§3-1: 非公開リストは同意不要)を出さない。
  // CEO追加指示(2026-08-04・タスク1): 非公開リスト(気になるプロ)は/bookmarksへ移設したため、
  // このファイルではpublicLists(送り手向け「＋新しいリストを作る」選択肢等)のみ使用する。
  const publicLists = lists.filter((l) => l.visibility !== 'private')

  function renderListCard(list: ReferralList, isPrivate: boolean) {
    return (
      <div
        key={list.id}
        ref={(el) => { listCardRefs.current[list.id] = el }}
        style={{
          background: '#fff', borderRadius: 14, padding: '16px',
          // CEO追加指示(2026-08-04・タスク3): 確定カードと同系の枠強化
          border: '1.5px solid #E5E7EB',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* CEO指摘(先行テスト・UI修正①): タイトルが「クライアントに表示される名前」と
                誤解されないよう、内部用であることを明示するラベルを常に出す。
                CEO追加指示(タスク3): ラベルは13px。 */}
            <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 2 }}>リスト名（内部用）</div>
            {/* §3-1改訂: タイトルのインライン編集(既存PATCH /api/referral/lists/[list_id] を利用)。
                連携候補(private)はタイトルが移行SQLの冪等ガードにも使われるため表示のみ(軽微指摘)。
                CEO追加指示(タスク3): クライアント名と同じ17px/fontWeight800に統一。 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              {isPrivate ? (
                <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1A2E', minWidth: 0 }}>{list.title}</div>
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
                    setJustCreatedListId((prev) => (prev === list.id ? null : prev))
                  }}
                  style={{
                    fontSize: 17, fontWeight: 800, color: '#1A1A2E', border: 'none', background: 'transparent',
                    padding: 0, flex: 1, minWidth: 0, fontFamily: 'inherit', outline: 'none',
                  }}
                />
              )}
              {/* CEO指摘(先行テスト・UI修正①): 公開状態を静かなチップで明示(§0-6準拠) */}
              <span
                style={{
                  fontSize: 13, color: '#6B7280', background: '#F3F4F6', border: '1px solid #E5E7EB',
                  borderRadius: 999, padding: '2px 8px', flexShrink: 0, whiteSpace: 'nowrap' as const,
                }}
              >
                {isPrivate ? '非公開' : 'リンク共有'}
              </span>
            </div>
            {/* CEO追加指示(2026-08-04・タスク4): 「プロを追加して作る」で作成された直後だけ、
                タイトルを変更できることを案内する(justCreatedListIdは編集操作or8秒後にクリア)。 */}
            {justCreatedListId === list.id && (
              <div style={{ fontSize: 13, color: '#C4A35A', marginTop: 4 }}>
                {justCreatedHintMessage}
              </div>
            )}
            {titleSavingId === list.id && (
              <div style={{ fontSize: 13, color: '#9CA3AF' }}>保存中...</div>
            )}
            {titleSavedId === list.id && (
              <div style={{ fontSize: 13, color: '#2E7D32' }}>保存しました</div>
            )}
            {titleError[list.id] && (
              <div style={{ fontSize: 13, color: '#B00020' }}>{titleError[list.id]}</div>
            )}
            {/* CEO指摘(先行テスト第3弾): comment=クライアントへのメッセージ(紹介ページの
                「先生からのメッセージ」)。表示⇔編集モードで後から変更できる(§0-7) */}
            {!isPrivate && (
              commentEditingId === list.id ? (
                <div style={{ marginTop: 6 }}>
                  <textarea
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value.slice(0, 500))}
                    placeholder="例: ご紹介した後も、経過は私が伺っていきます。安心してご相談ください。"
                    style={{
                      width: '100%', minHeight: 64, padding: '8px 10px', borderRadius: 8,
                      border: '1px solid #E5E7EB', fontSize: 12, boxSizing: 'border-box' as const,
                      resize: 'vertical' as const, lineHeight: 1.6,
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <button
                      onClick={async () => {
                        const ok = await updateListComment(list.id, commentDraft)
                        if (ok) setCommentEditingId(null)
                      }}
                      disabled={commentSavingId === list.id}
                      style={{
                        padding: '4px 12px', borderRadius: 6, border: 'none',
                        background: '#1A1A2E', color: '#fff', fontSize: 13, fontWeight: 600,
                        cursor: commentSavingId === list.id ? 'default' : 'pointer',
                        opacity: commentSavingId === list.id ? 0.6 : 1,
                      }}
                    >
                      {commentSavingId === list.id ? '保存中...' : '保存する'}
                    </button>
                    <button
                      onClick={() => setCommentEditingId(null)}
                      style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 13, cursor: 'pointer', padding: 0 }}
                    >
                      キャンセル
                    </button>
                  </div>
                  {commentError[list.id] && (
                    <div style={{ fontSize: 13, color: '#B00020', marginTop: 2 }}>{commentError[list.id]}</div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 13, color: '#9CA3AF' }}>クライアントへのメッセージ（紹介ページに表示）</div>
                  {list.comment ? (
                    <div
                      onClick={() => { setCommentEditingId(list.id); setCommentDraft(list.comment || '') }}
                      style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5, cursor: 'pointer', whiteSpace: 'pre-wrap' as const }}
                    >
                      {list.comment}
                    </div>
                  ) : (
                    <button
                      onClick={() => { setCommentEditingId(list.id); setCommentDraft(DEFAULT_CLIENT_MESSAGE) }}
                      style={{ background: 'none', border: 'none', color: '#C4A35A', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                    >
                      メッセージを設定する
                    </button>
                  )}
                  {commentSavedId === list.id && (
                    <div style={{ fontSize: 13, color: '#2E7D32', marginTop: 2 }}>保存しました</div>
                  )}
                </div>
              )
            )}
          </div>
          <button
            onClick={() => deleteList(list.id)}
            style={{ background: 'none', border: 'none', color: '#B00020', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
          >
            削除
          </button>
        </div>

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
                      {/* CEO指示(先行テスト第3弾): 名前タップでその人の個人カードへ */}
                      {item.professionals ? (
                        <a
                          href={`/card/${item.pro_id}`}
                          style={{ color: '#1A1A2E', textDecoration: 'none' }}
                        >
                          {item.professionals.name}
                        </a>
                      ) : (
                        '不明なプロ'
                      )}
                    </div>
                    {!isPrivate && <div style={{ fontSize: 13, color: label.color }}>{label.text}</div>}
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
                                background: '#1A1A2E', color: '#fff', fontSize: 13, fontWeight: 600,
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
                                fontSize: 13, cursor: 'pointer', padding: 0,
                              }}
                            >
                              キャンセル
                            </button>
                          </div>
                        )}
                        {pinNoteSavedKey === addKey && (
                          <div style={{ fontSize: 13, color: '#2E7D32', marginTop: 2 }}>保存しました</div>
                        )}
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => removePin(list.id, item.pro_id)}
                    disabled={!!pinRemoving[addKey]}
                    title={isPrivate ? '気になるプロから外す' : undefined}
                    style={
                      isPrivate
                        ? // CEO指示(先行テスト第3弾): 気になるプロは「外す」でなくカード♡と同じ
                          // 色付きハートで統一。テキスト字形は端末で形が揃わないためSVGで描画し、
                          // タップ即時に色が抜ける(塗り→枠線のみ)フィードバックを出す
                          { background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '2px 4px', lineHeight: 0 }
                        : { background: 'none', border: 'none', color: '#9CA3AF', fontSize: 13, cursor: 'pointer', flexShrink: 0 }
                    }
                  >
                    {isPrivate ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M12 21s-6.7-4.4-9.3-8.1C.8 10.2 1.5 6.6 4.3 5.2c2.1-1 4.6-.4 6 1.4l1.7 2.1 1.7-2.1c1.4-1.8 3.9-2.4 6-1.4 2.8 1.4 3.5 5 1.6 7.7C18.7 16.6 12 21 12 21z"
                          fill={pinRemoving[addKey] ? 'none' : '#C4A35A'}
                          stroke={pinRemoving[addKey] ? '#C9C4BA' : '#C4A35A'}
                          strokeWidth="1.6"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      '外す'
                    )}
                  </button>
                </div>
                {/* レビュー指摘(先行テスト): 外す/一言保存の失敗を可視化 */}
                {pinError && (
                  <div style={{ fontSize: 13, color: '#B00020', paddingLeft: 42 }}>{pinError}</div>
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

        {/* CEO指摘(先行テスト・UI修正③): プロを追加する3導線(探して追加/名前で追加/
            REALPROOF外を招待)を「＋ プロを追加」ボタン1つに集約し、押した時だけ展開する。
            🟡5レビュー指摘: declined(辞退)はサーバー側(items/route.ts)同様に枠を占有しないため
            カウントから除外する(consent_status!=='declined') */}
        {(isPrivate || list.items.filter((i) => i.consent_status !== 'declined').length < MAX_PINS) ? (
          (addProPanel[list.id] || 'closed') === 'closed' ? (
            <button
              onClick={() => toggleAddProPanel(list.id)}
              style={{
                background: 'none', border: '1px solid #C4A35A', color: '#C4A35A',
                borderRadius: 8, fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer',
              }}
            >
              ＋ プロを追加
            </button>
          ) : (
            <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 12px', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1A2E' }}>プロを追加</span>
                <button
                  onClick={() => toggleAddProPanel(list.id)}
                  style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 13, cursor: 'pointer', padding: 0 }}
                >
                  閉じる
                </button>
              </div>

              {addProPanel[list.id] === 'menu' && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                  {/* §3-0-2: プロを探す導線は/searchを転用する。リストカード内の独自ピッカーは作らず、
                      /searchの結果カードから直接このリストへ追加できる(SearchPageClient側の実装)。 */}
                  <a
                    href="/search"
                    style={{ fontSize: 12, color: '#C4A35A', fontWeight: 600, textDecoration: 'none' }}
                  >
                    {isPrivate ? '気になるプロを探して追加 →' : 'プロを探して追加 →'}
                  </a>
                  <button
                    onClick={() => setAddProPanel((prev) => ({ ...prev, [list.id]: 'name_search' }))}
                    style={{ background: 'none', border: 'none', color: '#1A1A2E', fontSize: 12, fontWeight: 600, textAlign: 'left' as const, cursor: 'pointer', padding: 0 }}
                  >
                    名前で追加
                  </button>
                  {!isPrivate && (
                    <button
                      onClick={() => setAddProPanel((prev) => ({ ...prev, [list.id]: 'invite' }))}
                      style={{ background: 'none', border: 'none', color: '#1A1A2E', fontSize: 12, fontWeight: 600, textAlign: 'left' as const, cursor: 'pointer', padding: 0 }}
                    >
                      REALPROOF外のプロを招待
                    </button>
                  )}
                </div>
              )}

              {addProPanel[list.id] === 'name_search' && (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setAddProPanel((prev) => ({ ...prev, [list.id]: 'menu' }))}
                    style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8, display: 'block' }}
                  >
                    ← 他の追加方法を選ぶ
                  </button>
                  <input
                    value={pinQuery[list.id] || ''}
                    onChange={(e) => searchPro(list.id, e.target.value)}
                    placeholder={isPrivate ? '名前でプロを検索して気になるプロに追加' : '名前でプロを検索してピン追加（最大3名）'}
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
                  {/* レビュー指摘(先行テスト): 検索失敗が「結果0件」と見分けがつかず無言だったため可視化 */}
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
                          {p.title && <div style={{ fontSize: 13, color: '#9CA3AF' }}>{p.title}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* §2-9: REALPROOF外のプロの招待(非公開リストでは掲載通知の前提が無いためaddProPanelには出てこない) */}
              {!isPrivate && addProPanel[list.id] === 'invite' && (
                <div style={{ minWidth: 0 }}>
                  <button
                    onClick={() => setAddProPanel((prev) => ({ ...prev, [list.id]: 'menu' }))}
                    style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8, display: 'block' }}
                  >
                    ← 他の追加方法を選ぶ
                  </button>
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
                      <div style={{ fontSize: 13, color: '#8A6D1F', lineHeight: 1.6 }}>
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
        ) : (
          !isPrivate && (
            <div style={{ fontSize: 13, color: '#9CA3AF' }}>ピンは最大3名までです</div>
          )
        )}

        {/* CEO指摘(先行テスト・UI修正②): 共有URLの常時表示をやめ、カード最下部にQR/共有/コピーの
            静かなボタン群として集約する。QRは既存BadgeQRModalと同じqrcode.react(既存依存)を利用。 */}
        {!isPrivate && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #E5E7EB' }}>
            <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 6 }}>
              クライアントに共有（紹介ページが開きます）
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              {/* CEO指示(先行テスト第3弾): 送り手がクライアントと同じ見え方を確認できるプレビュー */}
              <a
                href={`${SHARE_ORIGIN}/r/${list.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB',
                  background: '#fff', color: '#1A1A2E', fontSize: 12, fontWeight: 600,
                  textDecoration: 'none', display: 'inline-block',
                }}
              >
                プレビュー
              </a>
              <button
                onClick={() => setQrModalListId(list.id)}
                style={{
                  padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB',
                  background: '#fff', color: '#1A1A2E', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                QRコードを表示
              </button>
              {canNativeShare && (
                <button
                  onClick={() => shareListUrl(list.slug)}
                  style={{
                    padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB',
                    background: '#fff', color: '#1A1A2E', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  共有する
                </button>
              )}
              <button
                onClick={() => copyShareUrl(list.slug)}
                style={{
                  padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB',
                  background: '#fff', color: '#1A1A2E', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {copiedSlug === list.slug ? 'コピーしました' : 'URLをコピー'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // リスト作成カード(§3-0-2第3弾: 主導線から降格・折りたたみデフォルト)。
  // CEO追加指示(2026-08-04・タスク1): 「紹介する」タブの並びを①成立した紹介②紹介リスト群
  // ③新規作成に変更したため、このカードは最後尾に配置する。
  // CEO追加指示(タスク4): 入口を「プロを追加して作る」/「タイトルから作る」の2択メニューにする。
  const createListCard = (
    <div
      style={{
        background: '#fff', borderRadius: 14,
        padding: createEntryMode === 'closed' ? '12px 16px' : '18px 16px',
        border: '1.5px solid #E5E7EB', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      }}
    >
      {createEntryMode === 'closed' && (
        <button
          onClick={() => setCreateEntryMode('menu')}
          style={{ background: 'none', border: 'none', color: '#C4A35A', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >
          ＋ 新しいリストを作る
        </button>
      )}

      {createEntryMode === 'menu' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>
              {/* 先行テスト指摘C: 公開リストが0件の間は「最初の1件」であることを明示する */}
              {publicLists.length === 0 ? '最初の紹介リストを作りましょう' : '新しい紹介リストを作る'}
            </h3>
            <button
              onClick={() => setCreateEntryMode('closed')}
              style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 13, cursor: 'pointer', flexShrink: 0 }}
            >
              閉じる
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            <button
              onClick={() => setCreateEntryMode('pick_pro')}
              style={{
                padding: '10px 14px', borderRadius: 8, border: 'none', textAlign: 'left' as const,
                background: '#C4A35A', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              プロを追加して作る
            </button>
            <button
              onClick={() => setCreateEntryMode('title_form')}
              style={{
                padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', textAlign: 'left' as const,
                background: '#fff', color: '#1A1A2E', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              タイトルから作る
            </button>
          </div>
        </>
      )}

      {createEntryMode === 'pick_pro' && (
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setCreateEntryMode('menu')}
            style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8, display: 'block' }}
          >
            ← 他の作り方を選ぶ
          </button>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 8, lineHeight: 1.6 }}>
            最初に追加するプロを選んでください。選ぶとリストが作成されます
            <br />
            {/* レビュー指摘(軽微5) */}
            選んだ先生には掲載通知が届きます
          </div>
          <input
            value={pinQuery[NEW_LIST_PICK_KEY] || ''}
            onChange={(e) => searchPro(NEW_LIST_PICK_KEY, e.target.value)}
            placeholder="名前でプロを検索"
            disabled={creatingFromPro}
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
          {creatingFromPro && (
            <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 8 }}>リストを作成中...</div>
          )}
          {pinSearchError[NEW_LIST_PICK_KEY] && (
            <div style={{ fontSize: 13, color: '#B00020', marginTop: 4 }}>検索に失敗しました</div>
          )}
          {!creatingFromPro && (pinResults[NEW_LIST_PICK_KEY]?.length || 0) > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
              marginTop: 4, maxHeight: 240, overflowY: 'auto' as const,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}>
              {(pinResults[NEW_LIST_PICK_KEY] || []).map((p) => (
                <div
                  key={p.id}
                  onClick={() => (creatingFromPro ? undefined : createListFromPro(p))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    cursor: 'pointer', borderBottom: '1px solid #F3F4F6',
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

      {createEntryMode === 'title_form' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>
              {/* 先行テスト指摘C: 公開リストが0件の間は「最初の1件」であることを明示する */}
              {publicLists.length === 0 ? '最初の紹介リストを作りましょう' : '新しい紹介リストを作る'}
            </h3>
            <button
              onClick={() => setCreateEntryMode('closed')}
              style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 13, cursor: 'pointer', flexShrink: 0 }}
            >
              閉じる
            </button>
          </div>
          {/* CEO指摘(先行テスト第3弾): フィールドの意味を再定義。title=内部用リスト名(管理用・
              クライアント非表示)、comment=クライアントへのメッセージ(紹介ページに表示・後から変更可) */}
          <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 4 }}>
            内部用リスト名（管理用。クライアントには表示されません）
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
          <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 4 }}>
            クライアントへのメッセージ（紹介ページに「先生からのメッセージ」として表示。後から変更できます）
          </div>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value.slice(0, 500))}
            placeholder="例: ご紹介した後も、経過は私が伺っていきます。安心してご相談ください。"
            style={{
              width: '100%', minHeight: 60, padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB',
              fontSize: 13, boxSizing: 'border-box' as const, marginBottom: 10, resize: 'vertical' as const,
            }}
          />
          <button
            onClick={async () => {
              const ok = await createList()
              if (ok) setCreateEntryMode('closed')
            }}
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
            <span style={{ fontSize: 13, color: '#9CA3AF', marginLeft: 10 }}>
              タイトルを入力すると作成できます
            </span>
          )}
          {/* レビュー指摘(先行テスト): 作成失敗(403含む)が無言だったため可視化 */}
          {createListError && (
            <div style={{ fontSize: 13, color: '#B00020', marginTop: 8, lineHeight: 1.6 }}>{createListError}</div>
          )}
        </>
      )}
    </div>
  )

  // ステージ4(送り手分配・CEO決定): 「紹介した案件」タブの報酬サマリー(確定済み未払い/支払い済み累計)
  // レビュー指摘(軽微8): 合計はサーバー側集計値(sentPayoutsPending/PaidTotalJpy・全件対象)を使う。
  // レビュー指摘(中4): cancelled(手動返金で取消済み)の行は案件カードに表示しない。
  const payoutByBookingId: Record<string, SentPayout> = {}
  for (const p of sentPayouts) {
    if (p.status === 'cancelled') continue
    payoutByBookingId[p.booking_id] = p
  }

  // 報酬表示の再設計(CEO指示・2026-08-05): お支払い履歴(status='paid'のみ)をpaid_at新しい順に並べる。
  const paidPayoutsSorted = sentPayouts
    .filter((p) => p.status === 'paid')
    .slice()
    .sort((a, b) => {
      const at = a.paid_at ? new Date(a.paid_at).getTime() : 0
      const bt = b.paid_at ? new Date(b.paid_at).getTime() : 0
      return bt - at
    })
  const PAYOUT_HISTORY_PREVIEW_COUNT = 10
  const visiblePaidPayouts = payoutHistoryExpanded
    ? paidPayoutsSorted
    : paidPayoutsSorted.slice(0, PAYOUT_HISTORY_PREVIEW_COUNT)

  return (
    <div>
      {/* UI再構成(2026-08-04・CEO承認済み): 「紹介を受ける」サブタブ側 = 完了した紹介(受け手側)。
          単一マウントのまま表示のみCSSで切り替える(subtab切替での再フェッチを避ける)。 */}
      <div style={{ display: subtab === 'receive' ? 'block' : 'none' }}>
        <ReferralCompletedList proId={proId} onCountChange={onCompletedCountChange} />
      </div>

      {/* CEO指示(2026-08-04・IA再変更): 「紹介した案件」サブタブ = 成立した紹介(送り手側の
          予約一覧・担当プロとのやりとりスレッド)。旧「紹介する」タブから独立した3番目のタブ。 */}
      <div style={{ display: subtab === 'cases' ? 'flex' : 'none', flexDirection: 'column', gap: 12 }}>
        {/* ステージ4(送り手分配・CEO決定): 報酬サマリーカード。0件時は説明のみ表示する。 */}
        {sentPayoutsLoaded && (
          <div style={{ background: '#FAF7EF', borderRadius: 14, padding: '14px 16px', border: '1.5px solid #EAD9A6' }}>
            {sentPayoutsPendingTotalJpy === 0 && sentPayoutsPaidTotalJpy === 0 ? (
              <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>
                紹介報酬はセッション完了時に確定します(セッション価格の30%・予約金のお支払いが完了した案件が対象)。
              </div>
            ) : (
              // 報酬表示の再設計(CEO指示・2026-08-05): 報酬サマリーを主役化する。「確定済みの報酬」
              // (未払い)を大きく(13pxラベル+22px/800の金額)、「支払い済み累計」はその下に少し
              // 小さめ(16px/700)で表示する。
              <div style={{ color: '#1A1A2E' }}>
                <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.4 }}>確定済みの報酬</div>
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.3, marginTop: 2 }}>
                  ¥{sentPayoutsPendingTotalJpy.toLocaleString()}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#6B7280', marginTop: 8 }}>
                  支払い済み累計 ¥{sentPayoutsPaidTotalJpy.toLocaleString()}
                </div>
              </div>
            )}
            {/* ステージ4「Stripe Connect 口座登録導線」(CEO承認済み・2026-08-04) */}
            {/* レビュー指摘(軽微8): connectStatusがnull(未確定・403等でロード完了したが値が
                無い場合)は何も表示せず、空の区切り線だけが出る状態を防ぐ */}
            {connectStatusLoaded && connectStatus !== null && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #EAD9A6' }}>
                {connectStatus === 'enabled' ? (
                  <div style={{ fontSize: 13, color: '#2F7A4D', fontWeight: 600 }}>受け取り口座: 登録済み</div>
                ) : connectStatus === 'not_ready' ? (
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>口座登録機能は準備中です</div>
                ) : connectStatus === 'reviewing' ? (
                  // レビュー指摘(軽微7): 本人確認は提出済みだがStripe側の審査中。再開ボタンは
                  // 出さない(送り手が押しても状態が変わらないため)。
                  <div style={{ fontSize: 12, color: '#B45309' }}>口座情報を審査中です(1〜2営業日)</div>
                ) : connectStatus === 'pending' ? (
                  <div>
                    <button
                      onClick={handleConnectOnboard}
                      disabled={connectOnboarding}
                      style={{
                        padding: '8px 14px', borderRadius: 8, border: 'none',
                        background: '#1A1A2E', color: '#fff', fontSize: 12, fontWeight: 600,
                        cursor: connectOnboarding ? 'default' : 'pointer', opacity: connectOnboarding ? 0.6 : 1,
                      }}
                    >
                      口座登録を再開する
                    </button>
                    <div style={{ fontSize: 12, color: '#B45309', marginTop: 4 }}>登録が完了していません</div>
                  </div>
                ) : connectStatus === 'none' ? (
                  <div>
                    <button
                      onClick={handleConnectOnboard}
                      disabled={connectOnboarding}
                      style={{
                        padding: '8px 14px', borderRadius: 8, border: 'none',
                        background: '#1A1A2E', color: '#fff', fontSize: 12, fontWeight: 600,
                        cursor: connectOnboarding ? 'default' : 'pointer', opacity: connectOnboarding ? 0.6 : 1,
                      }}
                    >
                      報酬のお受け取り口座を登録する
                    </button>
                    <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4, lineHeight: 1.6 }}>
                      Stripeの安全な画面で本人確認と口座登録を行います(REAL PROOFはカード・口座情報を保持しません)
                    </div>
                  </div>
                ) : null}
                {connectError && (
                  <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>{connectError}</div>
                )}
              </div>
            )}

            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6, lineHeight: 1.6 }}>
              {connectStatus === 'enabled'
                ? '報酬はセッション完了後、自動でお受け取り口座へ送金されます(反映まで数日)。'
                : 'お支払いは月次でのお振込です。口座の自動受け取り(Stripe)は準備中です。'}
            </div>
          </div>
        )}

        {/* 報酬表示の再設計(CEO指示・2026-08-05): お支払い履歴(noteのお支払いページ風)。
            status='paid'をpaid_at新しい順に表示。直近10件+「もっと見る」で全件展開。 */}
        {sentPayoutsLoaded && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1.5px solid #E5E7EB', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 8 }}>お支払い履歴</div>
            {paidPayoutsSorted.length === 0 ? (
              <div style={{ fontSize: 13, color: '#9CA3AF' }}>まだお支払いはありません</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {visiblePaidPayouts.map((p) => {
                    const reflectionText = estimateReferralPayoutReflectionText(p.paid_at)
                    return (
                      <div
                        key={p.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          fontSize: 13,
                          borderBottom: '1px solid #F3F4F6',
                          paddingBottom: 8,
                        }}
                      >
                        <div style={{ color: '#1A1A2E', lineHeight: 1.6 }}>
                          <div>{formatPayoutDate(p.paid_at)}</div>
                          <div style={{ color: '#6B7280' }}>{p.client_nickname || 'クライアント'}さんの紹介</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, color: '#1A1A2E' }}>¥{p.amount_jpy.toLocaleString()}</div>
                          {reflectionText && (
                            <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 2 }}>
                              口座への反映予定: {reflectionText}頃(目安)
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {paidPayoutsSorted.length > PAYOUT_HISTORY_PREVIEW_COUNT && (
                  <button
                    onClick={() => setPayoutHistoryExpanded((v) => !v)}
                    style={{
                      marginTop: 10, fontSize: 13, color: '#6B7280', background: 'none', border: 'none',
                      textDecoration: 'underline', cursor: 'pointer', padding: 0,
                    }}
                  >
                    {payoutHistoryExpanded ? '閉じる' : 'もっと見る'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {sentLoading ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#9CA3AF', fontSize: 13 }}>読み込み中...</div>
        ) : sentBookings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#9CA3AF', fontSize: 13 }}>
            まだ紹介した案件はありません
          </div>
        ) : (
          sentBookings.map((b) => {
            const payout = payoutByBookingId[b.id]
            return (
            <div key={b.id} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1.5px solid #E5E7EB', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 1.6 }}>
                <strong>{b.client_nickname}さん</strong>
                {b.receiver_pro?.name && <span style={{ color: '#6B7280' }}> → {b.receiver_pro.name}さん</span>}
                <span style={{ marginLeft: 8, fontSize: 13, color: '#9CA3AF' }}>{SENT_STATUS_LABEL[b.status]}</span>
              </div>
              {b.menu_name && <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>メニュー: {b.menu_name}</div>}
              {payout && (
                <div style={{ fontSize: 12, color: '#8A6D1F', marginTop: 4, fontWeight: 600 }}>
                  紹介報酬 ¥{payout.amount_jpy.toLocaleString()} {payout.status === 'paid' ? '支払い済み' : '確定'}
                </div>
              )}
              <BookingThread
                bookingId={b.id}
                ownProId={proId}
                isSender={true}
                initialHandoverNote={b.handover_note}
                partnerRoleLabel={b.receiver_pro ? '担当プロ' : undefined}
                partnerName={b.receiver_pro?.name}
              />
            </div>
            )
          })
        )}
      </div>

      {/* 「紹介する」サブタブ側 = ①新規作成(CEO指摘: 埋もれ解消のため最上部に)②紹介リスト群
          CEO指示(2026-08-04・IA再変更): 成立した紹介は「紹介した案件」タブへ移動・
          気になるプロの移設案内は削除(恒久表示の撤回)。 */}
      <div style={{ display: subtab === 'send' ? 'flex' : 'none', flexDirection: 'column', gap: 24 }}>
      {/* ① 新規作成 */}
      {createListCard}

      {/* ② リスト一覧(公開/リンク共有のみ。気になるプロ=非公開リストは/bookmarksへ移設済み) */}
      {listsLoading ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: '#9CA3AF', fontSize: 13 }}>読み込み中...</div>
      ) : publicLists.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: '#9CA3AF', fontSize: 13 }}>
          まだ紹介リストがありません
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {publicLists.map((list) => renderListCard(list, false))}
        </div>
      )}

      {/* CEO指摘(先行テスト・UI修正②): クライアントに共有するURLのQRコードモーダル(タップで閉じる) */}
      {qrModalListId && (() => {
        const qrList = lists.find((l) => l.id === qrModalListId)
        if (!qrList) return null
        const qrUrl = `${SHARE_ORIGIN}/r/${qrList.slug}`
        return (
          <div
            onClick={() => setQrModalListId(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#fff', borderRadius: 16, padding: 24, maxWidth: 320, width: '100%',
                textAlign: 'center' as const, boxSizing: 'border-box' as const,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A2E', marginBottom: 12 }}>{qrList.title}</div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <QRCodeSVG value={qrUrl} size={200} />
              </div>
              <div style={{ fontSize: 13, color: '#9CA3AF', wordBreak: 'break-all' as const, marginBottom: 16 }}>
                {qrUrl}
              </div>
              <button
                onClick={() => setQrModalListId(null)}
                style={{
                  width: '100%', padding: '10px', borderRadius: 8, border: 'none',
                  background: '#1A1A2E', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                閉じる
              </button>
            </div>
          </div>
        )
      })()}
      </div>
    </div>
  )
}
