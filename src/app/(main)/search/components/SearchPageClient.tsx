'use client'

import { useEffect, useState } from 'react'
import { PREFECTURES } from '@/lib/prefectures'
import { COLORS, FONTS } from '@/lib/design-tokens'
import { TierBadge, getTierFromVotes } from '@/components/TierBadge'
import { trackPageView } from '@/lib/tracking'
import { REFERRAL_SIGNAL_DOT, isReferralReachable, computeReferralSignal } from '@/lib/referral-accepting'

const T = { ...COLORS, font: FONTS.main, fontSerif: FONTS.serif }

const CATEGORIES = [
  { id: 'multi',       label: '✨ Pick up' },
  { id: 'healing',     label: '痛みや不調を改善したい' },
  { id: 'body',        label: '機能的な体を手に入れたい' },
  { id: 'bodymake',    label: 'ボディメイクしたい' },
  { id: 'performance', label: 'パフォーマンスを上げたい' },
  { id: 'mind',        label: '心を整えたい' },
  { id: 'relax',       label: 'リラックスしたい' },
  { id: 'beauty',      label: '美しくなりたい' },
  { id: 'nutrition',   label: '食事・栄養を改善したい' },
  { id: 'skill',       label: '技術指導を受けたい' },
]

// CEO指示(2026-08-06): 「今月急上昇」はPick up(トップタブ)の既定表示に移設したため、
// 並び替えチップからは削除。先頭は「この分野のプロ」にする。
const SUB_CATEGORIES = [
  { id: 'specialist', label: '⭐ この分野のプロ' },
  { id: 'repeater',   label: '🔄 リピーターが多い' },
  { id: 'new_client', label: '🌊 新規に強い' },
  { id: 'top',        label: '🏆 総合力' },
]

interface ChipItem {
  id: string
  name: string
}

const DEFAULT_VISIBLE_CHIPS = 6
// §3-0-2(第3弾): 「追加」操作の中で新しいリストを作る選択を表す番兵値(実在するlist idと衝突しない固定文字列)
const NEW_LIST_SENTINEL = '__new_list__'

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

interface SearchPro {
  id: string
  name: string
  title: string
  prefecture: string | null
  area_description: string | null
  photo_url: string | null
  totalProofs: number
  recentProofs: number
  categoryScore: number
  categoryCount: Record<string, number>
  badges: {
    rising: boolean
    specialist: boolean
    multi: boolean
    top: boolean
  }
  repeaterRate: number | null
  regularCount: number
  firstCount: number
  repeaterCount: number
  voiceSnippet: string | null
  matchedVoice: string | null
  matchedProofLabel: string | null
  matchSource: 'voice' | 'proof' | null
  voiceMatchCount: number
  profileMatchField: 'name' | 'title' | 'area' | 'prefecture' | 'bio' | null
  featuredProof: {
    strengthLabel: string
    label: string
    votes: number
  } | null
  categoryTopProof: {
    strengthLabel: string
    votes: number
  } | null
  topPersonality: {
    label: string
  } | null
  topPersonalitiesByCategory?: {
    inner: { label: string; personality_label: string; votes: number } | null
    interpersonal: { label: string; personality_label: string; votes: number } | null
    atmosphere: { label: string; personality_label: string; votes: number } | null
  } | null
  /** §2-2改訂: 4色インジケータ(🟢受付中/🟡代理案内/🔴停止中/⚪️未設定・プロ向け画面のみ) */
  referralSignal?: 'open' | 'delegate' | 'closed'
  /** CEO指摘対応(2026-08-06): クライアント向け検索カード用。色記号は出さず、受付停止時のみ1行テキストを出す
   * ためのboolean(isReferralFullyLaunched()でゲート済み・現在は常にfalse)。 */
  referralClosedNotice?: boolean
}

interface OwnReferralList {
  id: string
  title: string
  visibility: 'link' | 'private' | 'public'
}

/** §3-0-2/🟡3: GET /api/referral/lists の生レスポンス(items含む)をパースするための型 */
interface OwnReferralListItemRaw {
  pro_id: string
  note: string | null
  consent_status: string
  has_valid_delegate?: boolean
  professionals: {
    id: string
    name: string
    title: string | null
    photo_url: string | null
    accepting_status: 'open' | 'closed' | null
    delegate_list_id: string | null
  } | null
}

interface OwnReferralListRaw {
  id: string
  title: string
  visibility: 'link' | 'private' | 'public'
  items: OwnReferralListItemRaw[]
}

/** 🟡3: private(連携候補)リストのピンを、既存の検索カードUIで表示できる形に変換する。
 * 統計系フィールド(totalProofs等)は取得していないため0/nullで埋める(カード側は既に
 * 条件付きレンダーのため、これらが0/nullでも崩れない)。 */
function buildPrivateCandidate(item: OwnReferralListItemRaw): SearchPro | null {
  const pro = item.professionals
  if (!pro) return null
  return {
    id: pro.id,
    name: pro.name,
    title: pro.title || '',
    prefecture: null,
    area_description: null,
    photo_url: pro.photo_url,
    totalProofs: 0,
    recentProofs: 0,
    categoryScore: 0,
    categoryCount: {},
    badges: { rising: false, specialist: false, multi: false, top: false },
    repeaterRate: null,
    regularCount: 0,
    firstCount: 0,
    repeaterCount: 0,
    voiceSnippet: null,
    matchedVoice: null,
    matchedProofLabel: null,
    matchSource: null,
    voiceMatchCount: 0,
    profileMatchField: null,
    featuredProof: null,
    categoryTopProof: null,
    topPersonality: null,
    topPersonalitiesByCategory: null,
    referralSignal: computeReferralSignal(pro.accepting_status, !!item.has_valid_delegate),
  }
}

interface Props {
  /** §3-2: FEATURE_SEARCH_PRIVATE=true 時、プロ向けに用途再定義の説明文を1行追加する */
  proNotice?: boolean
  /**
   * レビュー指摘: 受付シグナル(3色ドット/「紹介につながる人のみ表示」)はプロ閲覧時のみ表示する。
   * 一般クライアント・未ログインには一切出さない（サーバー側 getViewerIsProStrict() で判定済みの値を渡す）。
   */
  showReferralSignals?: boolean
  /** §3-0-2: 「紹介リストに追加」ボタンを自分自身のカードに出さないための自分のprofessionals.id */
  viewerProId?: string | null
  /** 🟡4レビュー指摘: allowlist(FEATURE_REFERRAL_LISTS)期間中、対象プロのみ「紹介リストに追加」を表示する */
  referralWriteEnabled?: boolean
}

export default function SearchPageClient({
  proNotice = false,
  showReferralSignals = false,
  viewerProId = null,
  referralWriteEnabled = false,
}: Props) {
  const [category, setCategory] = useState('multi')
  // CEO指示(2026-08-06): 「今月急上昇」チップを廃止したため、既定選択は先頭チップの「この分野のプロ」に揃える
  const [subCategory, setSubCategory] = useState('specialist')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedPrefecture, setSelectedPrefecture] = useState('')
  const [professionals, setProfessionals] = useState<SearchPro[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [chips, setChips] = useState<ChipItem[]>([])
  const [chipsLoading, setChipsLoading] = useState(true)
  const [chipsExpanded, setChipsExpanded] = useState(false)
  const [activeKeywordId, setActiveKeywordId] = useState<string | null>(null)
  const [matchedKeywords, setMatchedKeywords] = useState<string[]>([])
  // §2-2改訂: 「紹介につながる人のみ表示」フィルタ(仕様通りデフォルトOFF)。クライアント側の最終段の絞りのみ。
  const [referralOnlyFilter, setReferralOnlyFilter] = useState(false)

  // §3-0-2: /search転用（「紹介リストに追加」導線。プロがプロを探す面としての機能）
  // key = professionals.id（addPanelForに一致するカードのみ選択UIを開く）
  const [addPanelFor, setAddPanelFor] = useState<string | null>(null)
  const [ownLists, setOwnLists] = useState<OwnReferralList[]>([])
  const [ownListsLoaded, setOwnListsLoaded] = useState(false)
  const [ownListsLoading, setOwnListsLoading] = useState(false)
  // ⚪️8レビュー指摘: 取得失敗と「0件」を区別して表示するため
  const [ownListsError, setOwnListsError] = useState(false)
  const [selectedListFor, setSelectedListFor] = useState<Record<string, string>>({})
  const [addStatus, setAddStatus] = useState<
    Record<string, { status: 'loading' | 'success' | 'error'; message?: string }>
  >({})
  // R6レビュー指摘(重大): 二重リスト作成防止の作成済みlistIdはaddStatusから独立させて保持する。
  // addStatusに同居させるとtoggleAddPanelのリセット(delete)で消え、パネル開き直し→再試行で
  // 同名の共有リストが二重作成される(slug付きの実データが増える)。
  const [createdListIdFor, setCreatedListIdFor] = useState<Record<string, string>>({})
  // §3-0-2(第3弾): selectで「＋新しいリストを作る」を選んだ時のタイトル入力(key=professionals.id)
  const [newListTitleFor, setNewListTitleFor] = useState<Record<string, string>>({})

  // 🟡3: 「♡ 気になる（連携候補）」タブ。referralWriteEnabledのプロにのみ見せる。
  // ONにすると自分のprivate(連携候補)リストにピンしているプロだけをカード表示する。
  const [mineOnlyFilter, setMineOnlyFilter] = useState(false)
  const [privateCandidates, setPrivateCandidates] = useState<SearchPro[]>([])

  // 着地計測: ?src= を検索ページ着地として記録（source は trackPageView 内の getSource() が拾う）
  useEffect(() => {
    trackPageView('search')
  }, [])

  // チップデータ取得（フィルタ変更ごとに再取得・取得時にシャッフル+「もっと見る」リセット）
  useEffect(() => {
    let cancelled = false
    const loadChips = async () => {
      setChipsLoading(true)
      try {
        const params = new URLSearchParams({ category, sub: subCategory })
        if (selectedPrefecture) params.set('prefecture', selectedPrefecture)
        const res = await fetch(`/api/search/keyword-chips?${params.toString()}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const items = (data.chips || []) as ChipItem[]
        setChips(shuffle(items))
        setChipsExpanded(false)
      } catch (e) {
        console.error('keyword-chips fetch error:', e)
      } finally {
        if (!cancelled) setChipsLoading(false)
      }
    }
    loadChips()
    return () => { cancelled = true }
  }, [category, subCategory, selectedPrefecture])

  // フィルタ変更で chips が更新された時、active keyword が新リストに含まれなければクリア
  useEffect(() => {
    if (chipsLoading) return
    if (!activeKeywordId) return
    if (chips.find((c) => c.id === activeKeywordId)) return
    setActiveKeywordId(null)
    setQuery('')
  }, [chips, chipsLoading, activeKeywordId])

  // デバウンス（400ms）
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 400)
    return () => clearTimeout(timer)
  }, [query])

  // APIフェッチ（チップ active 時は by-keyword・それ以外は既存 /api/search）
  useEffect(() => {
    const fetchPros = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          category,
          sub: subCategory,
        })
        if (selectedPrefecture) params.set('prefecture', selectedPrefecture)

        let endpoint: string
        if (activeKeywordId) {
          params.set('keyword_id', activeKeywordId)
          endpoint = `/api/search/by-keyword?${params.toString()}`
        } else {
          params.set('q', debouncedQuery)
          endpoint = `/api/search?${params.toString()}`
        }

        const res = await fetch(endpoint, { cache: 'no-store' })
        const data = await res.json()
        setProfessionals(data.professionals || [])
        setTotal(data.total || 0)
        setMatchedKeywords(activeKeywordId ? ((data.matchedKeywords || []) as string[]) : [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchPros()
  }, [category, subCategory, debouncedQuery, selectedPrefecture, activeKeywordId])

  // ハイライト対象キーワード:チップ active 時は主キーワード+同義語、通常時は debouncedQuery
  const highlightTerms: string[] =
    activeKeywordId && matchedKeywords.length > 0
      ? matchedKeywords
      : debouncedQuery
        ? [debouncedQuery]
        : []

  // 検索ワードハイライト(multi-term・全箇所マーク・大小区別なし)
  const highlightQuery = (text: string) => {
    if (!text || highlightTerms.length === 0) return text
    const escaped = highlightTerms
      .filter((t) => t && t.length > 0)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    if (escaped.length === 0) return text
    const re = new RegExp(`(${escaped.join('|')})`, 'gi')
    const parts = text.split(re)
    return (
      <>
        {parts.map((p, i) =>
          i % 2 === 1 ? (
            <mark key={i} style={{ background: 'none', color: T.gold, fontWeight: 700 }}>
              {p}
            </mark>
          ) : (
            <span key={i}>{p}</span>
          )
        )}
      </>
    )
  }

  // §3-0-2: 自分の紹介リスト一覧を一度だけ取得する(パネルを初めて開いた時、または
  // 「♡ 気になる」タブをONにした時)。連携候補(private)は「♡ 気になる（連携候補）」として
  // 先頭に出す(親切設計)。🟡3: 同じレスポンスからprivateリストのピンをカード表示用に変換する。
  async function ensureOwnListsLoaded() {
    if (ownListsLoaded || ownListsLoading) return
    await loadOwnLists()
  }

  // R5レビュー指摘(重大②): フェッチ本体を分離。追加成功後の再取得は ownListsLoaded を
  // 落とさずにこれを直接呼ぶ(♡タブ表示中に「読み込み中...」へ置き換わって固着するのを防ぐ)。
  async function loadOwnLists() {
    setOwnListsLoading(true)
    setOwnListsError(false)
    try {
      const res = await fetch('/api/referral/lists', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        const rawLists = (data.lists || []) as OwnReferralListRaw[]
        const sorted = [
          ...rawLists.filter((l) => l.visibility === 'private'),
          ...rawLists.filter((l) => l.visibility !== 'private'),
        ]
        setOwnLists(sorted.map((l) => ({ id: l.id, title: l.title, visibility: l.visibility })))

        const candidates: SearchPro[] = []
        for (const l of rawLists) {
          if (l.visibility !== 'private') continue
          for (const item of l.items || []) {
            const candidate = buildPrivateCandidate(item)
            if (candidate) candidates.push(candidate)
          }
        }
        // 軽微指摘: 複数privateリストに同じプロがピンされている場合に備え、pro.idでdedupeする
        // (downlevelIteration無効のため[...new Set()]でなくArray.from(new Map())方式)
        const dedupedCandidates = Array.from(new Map(candidates.map((c) => [c.id, c])).values())
        setPrivateCandidates(dedupedCandidates)
      } else {
        // ⚪️8レビュー指摘: 取得失敗を明示する(0件と区別)
        setOwnListsError(true)
      }
    } catch {
      setOwnListsError(true)
    } finally {
      setOwnListsLoaded(true)
      setOwnListsLoading(false)
    }
  }

  function toggleAddPanel(proId: string) {
    if (addPanelFor === proId) {
      setAddPanelFor(null)
      return
    }
    setAddPanelFor(proId)
    // ⚪️10レビュー指摘: undefinedの値を持つキーを残さず、キー自体を削除してリセットする
    setAddStatus((prev) => {
      const next = { ...prev }
      delete next[proId]
      return next
    })
    ensureOwnListsLoaded()
  }

  // 🔴1レビュー指摘: 「♡ 気になる」タブON時は連携候補(private)を見ている文脈のため、
  // 追加先の選択肢からprivateリストを除外する(同じprivateリストへの再追加→409 already_pinned
  // を構造的に防ぐ)。既定選択も同じ絞り(非privateの先頭)に合わせ、非privateが無ければ
  // undefined(=選択肢なし。§3-0-2第3弾: その場合はdefaultSelectionが「＋新しいリストを作る」に倒す)。
  function getDefaultListId(): string | undefined {
    if (mineOnlyFilter) {
      return ownLists.find((l) => l.visibility !== 'private')?.id
    }
    return ownLists[0]?.id
  }

  // §3-0-2(第3弾): 共有リストが1件も無い(または選択可能な既存リストが無い)場合、
  // 「＋新しいリストを作る」を既定選択にする(=空リストを先に作る手順・ダッシュボードへ戻る
  // 手順を両方不要にする)。
  function defaultSelection(): string {
    return getDefaultListId() || selectableOwnLists[0]?.id || NEW_LIST_SENTINEL
  }

  // R5レビュー指摘(重大①): selectの表示値とPOST先の解決を1本化する(同じ判定を2箇所に書かない)。
  // selectedListForは♡タブのON/OFFを跨いで残るため、現在の選択肢集合(selectableOwnLists)に
  // 含まれない選択は無効化してデフォルトへ倒す。表示と書き込み先が食い違うと、意図しない
  // リストへの掲載(空約束・無断公開)につながる。§3-0-2第3弾: NEW_LIST_SENTINELはPOST先の
  // リストIDではないため、実在するlist idのみここで通す(sentinelがPOST先に渡らないガード)。
  function effectiveSelection(proId: string): string {
    const sel = selectedListFor[proId]
    if (sel === NEW_LIST_SENTINEL) return NEW_LIST_SENTINEL
    if (sel && selectableOwnLists.some((l) => l.id === sel)) return sel
    return defaultSelection()
  }

  // §3-0-2(第3弾): 新規リスト作成のみを担う(items POSTは含まない)。作成失敗時の文言は
  // ReferralTab側のcreateListErrorMessageと同じ4系統(401/403/400/500)に揃える。
  async function postCreateNewList(title: string): Promise<{ ok: boolean; id?: string; message?: string }> {
    try {
      const res = await fetch('/api/referral/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ title, comment: null }),
      })
      if (res.ok) {
        const data = await res.json()
        return { ok: true, id: data.list?.id }
      }
      const err = await res.json().catch(() => ({}))
      const message =
        err?.error === 'title_required'
          ? 'タイトルを入力してください'
          : err?.error === 'title_too_long'
            ? 'タイトルが長すぎます（200文字まで）'
            : res.status === 401
              ? 'プロアカウントでログインしているか確認してください'
              : res.status === 403
                ? 'まだこの機能の対象アカウントではありません'
                : 'リストの作成に失敗しました'
      return { ok: false, message }
    } catch {
      return { ok: false, message: 'リストの作成に失敗しました' }
    }
  }

  // 実際のピン追加POST。既存リストへの追加・新規作成後の追加いずれからも呼ばれる共通処理。
  async function postAddToListItems(listId: string, proId: string) {
    try {
      const res = await fetch(`/api/referral/lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ pro_id: proId }),
      })
      if (res.ok) {
        setAddStatus((prev) => ({ ...prev, [proId]: { status: 'success', message: '追加しました' } }))
        // 追加まで完了したら、新規作成由来の作成済みlistIdは役目を終えるため掃除する
        setCreatedListIdFor((prev) => {
          const next = { ...prev }
          delete next[proId]
          return next
        })
        // ⚪️4→R5重大②修正: ownListsLoadedを落とすと♡タブ表示中に再フェッチ導線が無く
        // 「読み込み中...」で固着するため、一覧表示を保ったまま直接再取得して静かに最新化する
        if (!ownListsLoading) void loadOwnLists()
      } else {
        const err = await res.json().catch(() => ({}))
        // ⚪️10レビュー指摘: self_pin_not_allowed / forbidden、🔴2レビュー指摘: target_not_in_program を追加
        const message =
          err.error === 'already_pinned'
            ? '既に追加済みです'
            : err.error === 'target_not_accepting'
              ? 'この先生は紹介の受付を停止中です'
              : err.error === 'target_not_in_program'
                ? 'この先生はまだ紹介機能の対象ではありません'
                : err.error === 'max_pins_reached'
                  ? 'このリストは3名まで（上限）です'
                  : err.error === 'self_pin_not_allowed'
                    ? '自分自身は追加できません'
                    : err.error === 'forbidden'
                      ? 'まだこの機能の対象アカウントではありません'
                      : '追加に失敗しました'
        setAddStatus((prev) => ({ ...prev, [proId]: { status: 'error', message } }))
      }
    } catch {
      setAddStatus((prev) => ({
        ...prev,
        [proId]: { status: 'error', message: '追加に失敗しました' },
      }))
    }
  }

  // §3-0-2(第3弾): 「追加」の実処理。既存の共有リストを選んでいればそのまま追加、
  // 「＋新しいリストを作る」を選んでいればタイトル入力からリスト作成→追加まで1操作で行う。
  async function submitAddToList(proId: string) {
    const selection = effectiveSelection(proId)

    if (selection !== NEW_LIST_SENTINEL) {
      setAddStatus((prev) => ({ ...prev, [proId]: { status: 'loading' } }))
      await postAddToListItems(selection, proId)
      return
    }

    const title = (newListTitleFor[proId] || '').trim()
    if (!title) {
      setAddStatus((prev) => ({ ...prev, [proId]: { status: 'error', message: 'リストの名前を入力してください' } }))
      return
    }

    // 再試行時の二重リスト作成防止: 既に作成済みのリストがあれば再利用し、items POSTのみ再実行する
    // (createdListIdForはパネル開閉のリセットで消えない独立state。R6レビュー指摘)
    const existingCreatedId = createdListIdFor[proId]
    setAddStatus((prev) => ({ ...prev, [proId]: { status: 'loading' } }))

    let targetListId = existingCreatedId
    if (!targetListId) {
      const created = await postCreateNewList(title)
      if (!created.ok || !created.id) {
        setAddStatus((prev) => ({ ...prev, [proId]: { status: 'error', message: created.message || 'リストの作成に失敗しました' } }))
        return
      }
      targetListId = created.id
      setCreatedListIdFor((prev) => ({ ...prev, [proId]: targetListId as string }))
      setOwnLists((prev) => [...prev, { id: targetListId as string, title, visibility: 'link' }])
    }

    await postAddToListItems(targetListId, proId)
  }

  // §2-2改訂: 「紹介につながる人のみ」フィルタ(最終段の絞りのみ・既存の並び順は変更しない)
  // レビュー指摘: showReferralSignalsがfalse(非プロ)の場合はチェックボックス自体を出さないため
  // referralOnlyFilterは常にfalseのままだが、念のためここでもゲートする。
  // 🟡3: 「♡ 気になる」ON時は通常検索結果を差し替え、自分のprivateリストのピンのみ表示する
  // (referralWriteEnabledが前提のため、mineOnlyFilter自体は常にfalse固定でも安全に倒れる)。
  const displayedPros = referralWriteEnabled && mineOnlyFilter
    ? privateCandidates
    : showReferralSignals && referralOnlyFilter
      ? professionals.filter((p) => isReferralReachable(p.referralSignal))
      : professionals

  // 🔴1レビュー指摘: 「♡ 気になる」タブON時は連携候補(private)を見ている文脈のため、
  // 追加先の選択肢からprivateリストを除外する(同じprivateリストへの再追加を構造的に防ぐ)。
  // ♡タブOFF時は従来通りprivateも選択肢に出す(「♡気になる」への保存導線)。
  const selectableOwnLists = mineOnlyFilter ? ownLists.filter((l) => l.visibility !== 'private') : ownLists

  // 🟡3: 「♡ 気になる」ON時は通常検索fetchのloadingでなく、自分のリスト取得の初回完了を見る。
  // R5重大②修正: ownListsLoadingを見ない(追加成功後のバックグラウンド再取得中も一覧を保つ。
  // 初回はownListsLoaded=falseなので従来通り「読み込み中」になる)。
  const isLoading = referralWriteEnabled && mineOnlyFilter ? !ownListsLoaded : loading

  // 空状態メッセージ
  const getEmptyMessage = () => {
    if (referralWriteEnabled && mineOnlyFilter && ownListsError) {
      return 'リストの取得に失敗しました'
    }
    if (referralWriteEnabled && mineOnlyFilter) {
      return 'まだ気になるプロがいません。カードの「＋ 紹介リストに追加」から気になるプロに追加できます'
    }
    return '該当するプロが見つかりませんでした'
  }

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: T.font }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>

        {/* ダークヘッダー（trustと世界観統一・検索窓統合。静的JSXなので初期HTMLに含まれる） */}
        <div style={{
          background: T.dark, borderRadius: 12, padding: '24px 20px', marginBottom: 20,
        }}>
          {/* eyebrow */}
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 3, color: T.gold, marginBottom: 10,
          }}>
            REALPROOF
          </div>

          {/* メイン見出し（セリフ体・h1） */}
          <h1 style={{
            fontSize: 20, fontWeight: 800, color: '#FAFAF7',
            lineHeight: 1.5, margin: 0, fontFamily: T.fontSerif,
          }}>
            この声は、リアルな場でしか生まれません。
          </h1>

          {/* サブテキスト */}
          <p style={{
            fontSize: 12, color: 'rgba(250,250,247,0.72)', lineHeight: 1.7, margin: '10px 0 16px',
          }}>
            実際にセッションを受けた本人が、その場でしか記録できない「声」。書き換えられず、お金で順位も変わりません。
          </p>

          {/* §3-2: FEATURE_SEARCH_PRIVATE有効時のみ・プロ向け用途再定義の説明文（1行） */}
          {proNotice && (
            <p style={{
              fontSize: 11, color: T.gold, lineHeight: 1.7, margin: '0 0 12px', fontWeight: 600,
            }}>
              この検索は「連携できるプロを探す」ためのものに再定義されました。クライアント向けの一覧検索は非公開です。
            </p>
          )}

          {/* 検索ボックス（移設・ダーク背景に白い入力欄。検索ロジック/stateは既存を流用） */}
          <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: T.textMuted }}>
            {'🔍'}
          </span>
          <input
            type="text"
            value={query}
            onChange={e => {
              const v = e.target.value
              setQuery(v)
              if (v.length > 0 && activeKeywordId) {
                setActiveKeywordId(null)
              }
            }}
            placeholder="悩み・不調・改善したいこと・名前で探す"
            style={{
              width: '100%', padding: '11px 36px 11px 36px', borderRadius: 10,
              border: 'none', background: '#FAFAF7', color: T.dark,
              fontSize: 13, fontFamily: T.font, outline: 'none', boxSizing: 'border-box',
            }}
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setActiveKeywordId(null)
              }}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', fontSize: 16, color: T.textMuted,
                cursor: 'pointer', padding: 0, lineHeight: 1,
              }}
            >
              {'✕'}
            </button>
          )}
          </div>

          {/* 仕組みをくわしく → */}
          <a href="/trust" style={{
            display: 'inline-block', marginTop: 12, fontSize: 12,
            fontWeight: 700, color: T.gold, textDecoration: 'none',
          }}>
            仕組みをくわしく →
          </a>
        </div>

        {/* キーワードチップセクション(シンプル版・カテゴリ分けなし) */}
        {!chipsLoading && chips.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: T.dark, marginBottom: 10,
            }}>
              人気のキーワード
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(chipsExpanded ? chips : chips.slice(0, DEFAULT_VISIBLE_CHIPS)).map((chip) => {
                const active = activeKeywordId === chip.id
                return (
                  <button
                    key={chip.id}
                    onClick={() => {
                      setActiveKeywordId(chip.id)
                      setQuery(chip.name)
                    }}
                    style={{
                      padding: '5px 12px', borderRadius: 16, fontSize: 11, fontWeight: 500,
                      border: 'none',
                      background: active ? T.dark : '#F0EBE0',
                      color: active ? '#fff' : T.dark,
                      cursor: 'pointer', fontFamily: T.font,
                    }}
                  >
                    {chip.name}
                  </button>
                )
              })}
              {!chipsExpanded && chips.length > DEFAULT_VISIBLE_CHIPS && (
                <button
                  onClick={() => setChipsExpanded(true)}
                  style={{
                    padding: '5px 12px', borderRadius: 16, fontSize: 11, fontWeight: 500,
                    border: `1px dashed ${T.cardBorder}`,
                    background: 'transparent', color: T.textSub,
                    cursor: 'pointer', fontFamily: T.font,
                  }}
                >
                  もっと見る (+{chips.length - DEFAULT_VISIBLE_CHIPS})
                </button>
              )}
            </div>
          </div>
        )}

        {/* カテゴリタブ（横スクロール） */}
        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 8,
          scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
        }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                border: category === cat.id ? 'none' : `1px solid ${T.cardBorder}`,
                background: category === cat.id ? T.dark : T.cardBg,
                color: category === cat.id ? '#fff' : T.dark,
                cursor: 'pointer', fontFamily: T.font, scrollSnapAlign: 'start',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* サブカテゴリ（カテゴリ選択時のみ表示、multi/noneでは非表示） */}
        {category !== 'none' && category !== 'multi' && (
          <div style={{
            display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 8, marginBottom: 12,
          }}>
            {SUB_CATEGORIES.map(sub => (
              <button
                key={sub.id}
                onClick={() => setSubCategory(sub.id)}
                style={{
                  flexShrink: 0, padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                  border: subCategory === sub.id ? `1.5px solid ${T.gold}` : `1px solid ${T.cardBorder}`,
                  background: T.cardBg,
                  color: subCategory === sub.id ? T.gold : T.textMuted,
                  cursor: 'pointer', fontFamily: T.font,
                }}
              >
                {sub.label}
              </button>
            ))}
          </div>
        )}

        {/* CEO指示(2026-08-06): Pick up既定表示は「今週の急上昇」順であることを明示する見出し
            (何の順で並んでいるか分からないとランダムと同じで価値が伝わらない・下限票数は内部運用のため出さない)。
            検索/キーワード一致時や「♡気になる」表示中は並び順の説明が変わるため出さない。 */}
        {category === 'multi' && !debouncedQuery && !activeKeywordId && !(referralWriteEnabled && mineOnlyFilter) && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.dark }}>今週の急上昇</div>
            <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>
              直近7日で新しくプルーフが集まった方
            </div>
          </div>
        )}

        {/* 都道府県プルダウン */}
        <div style={{ marginBottom: 12 }}>
          <select
            value={selectedPrefecture}
            onChange={e => setSelectedPrefecture(e.target.value)}
            style={{
              padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.cardBorder}`,
              background: T.cardBg, fontSize: 12, fontFamily: T.font,
              color: selectedPrefecture ? T.dark : T.textMuted, cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">すべてのエリア</option>
            {PREFECTURES.map(pref => (
              <option key={pref} value={pref}>{pref}</option>
            ))}
          </select>
        </div>

        {/* §2-2改訂: 「紹介につながる人のみ表示」フィルタ(デフォルトOFF)。レビュー指摘: プロ閲覧時のみ表示
            🔴3レビュー指摘: ♡タブON時はprivateCandidatesに適用されず無言で無効化されるため非表示にする */}
        {showReferralSignals && !mineOnlyFilter && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textSub, marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={referralOnlyFilter}
              onChange={e => setReferralOnlyFilter(e.target.checked)}
            />
            紹介につながる人のみ表示
          </label>
        )}

        {/* 🟡3: 「♡ 気になる（連携候補）」タブ。referralWriteEnabledのプロにのみ表示。
            ONにすると自分のprivateリストのピンだけを表示し、共有リストへの追加(昇格)導線を出す */}
        {referralWriteEnabled && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textSub, marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={mineOnlyFilter}
              onChange={e => {
                const checked = e.target.checked
                setMineOnlyFilter(checked)
                if (checked) ensureOwnListsLoaded()
              }}
            />
            ♡ 気になるプロのみ表示
          </label>
        )}

        {/* 結果カウント */}
        {!isLoading && (
          <div style={{ fontSize: 11, color: T.textSub, marginBottom: 10, fontWeight: 500 }}>
            {(mineOnlyFilter && referralWriteEnabled) || referralOnlyFilter
              ? displayedPros.length
              : total}名のプロが見つかりました
          </div>
        )}

        {/* プロ一覧 */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: T.textMuted, fontSize: 14 }}>
            読み込み中...
          </div>
        ) : displayedPros.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: T.textMuted, fontSize: 13 }}>
            {getEmptyMessage()}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayedPros.map((p) => (
                // 🟡5レビュー指摘: <a>内にbutton/selectをネストするのは不正HTML(iOS Safariで誤発火リスク)。
                // カード全体を<div>でラップし、<a>はカード本体(従来のクリック領域)まで、
                // 「紹介リストに追加」ボタン/選択パネルは<a>の外側の兄弟要素として配置する。
                <div
                  key={p.id}
                  style={{
                    background: T.cardBg,
                    border: `1px solid ${T.cardBorder}`, borderRadius: 14,
                    padding: 14, transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = T.gold)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = T.cardBorder)}
                >
                <a
                  href={debouncedQuery && p.voiceMatchCount >= 1
                    ? `/card/${p.id}?tab=voices&highlight=${encodeURIComponent(debouncedQuery)}`
                    : `/card/${p.id}`
                  }
                  style={{ display: 'block', textDecoration: 'none' }}
                >
                  {/* アイコン + 名前 + 職種 + エリア */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={p.name}
                        style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div style={{
                        width: 48, height: 48, borderRadius: '50%', background: T.dark,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 18, fontWeight: 'bold', flexShrink: 0,
                      }}>
                        {p.name?.charAt(0)}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: T.dark }}>
                          {highlightQuery(p.name)}
                        </div>
                        {(p.recentProofs || 0) > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, color: T.textSub }}>
                            {(p.recentProofs || 0) >= 15 ? '🔥' : '🟢'} 今月 {p.recentProofs}人に評価されています
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: T.gold, fontWeight: 600, marginTop: 1 }}>
                        {highlightQuery(p.title)}
                      </div>
                      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                        {highlightQuery(p.prefecture || '')}
                        {p.area_description ? ` · ` : ''}
                        {highlightQuery(p.area_description || '')}
                        {showReferralSignals && p.referralSignal && (
                          <span style={{ marginLeft: 6 }}>{REFERRAL_SIGNAL_DOT[p.referralSignal]}</span>
                        )}
                      </div>
                      {/* CEO指摘対応(2026-08-06・§3): クライアント向け検索カードのみ・受付中(🟢)は
                          何も表示せず、停止中のときだけ控えめな1行テキストで知らせる(色記号は使わない・
                          §16-7でクライアント向け公開カードは色を出さず文章で伝える方針に揃える)。
                          プロ向け画面(showReferralSignals)は既存の🟢🟡🔴ドット表示のみで変更しない。 */}
                      {!showReferralSignals && p.referralClosedNotice && (
                        <div style={{ fontSize: 13, color: T.textMuted, marginTop: 3 }}>
                          現在ご紹介を受け付けていません
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Featured Proof（カテゴリ別 or デフォルト） */}
                  {(() => {
                    const proof = (category !== 'multi' && p.categoryTopProof) || p.featuredProof
                    if (!proof) return null
                    return (
                      <div style={{
                        marginTop: 10, padding: '6px 10px', background: 'rgba(196,163,90,0.06)',
                        borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        {(() => {
                          // SPECIALIST/MASTER/LEGEND はメダル画像で区別、SPECIALIST 未達は ⭐ を維持
                          const proofTier = getTierFromVotes(proof.votes)
                          const certTier =
                            proofTier === 'SPECIALIST' || proofTier === 'MASTER' || proofTier === 'LEGEND'
                              ? proofTier
                              : null
                          return certTier ? (
                            <TierBadge tier={certTier} size="sm" showLabel={false} />
                          ) : (
                            <span style={{ fontSize: 12 }}>{'⭐'}</span>
                          )
                        })()}
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.dark }}>
                          {proof.strengthLabel}
                        </span>
                        <span style={{ fontSize: 10, color: T.gold, fontWeight: 600 }}>
                          ({proof.votes}人)
                        </span>
                      </div>
                    )
                  })()}

                  {/* パーソナリティTOP */}
                  {(() => {
                      const cats = p.topPersonalitiesByCategory
                      if (!cats) return null
                      const labels: string[] = []
                      if (cats.inner) labels.push(cats.inner.personality_label || cats.inner.label)
                      if (cats.interpersonal) labels.push(cats.interpersonal.personality_label || cats.interpersonal.label)
                      if (cats.atmosphere) labels.push(cats.atmosphere.personality_label || cats.atmosphere.label)
                      if (labels.length === 0) return null
                      return (
                        <div style={{
                          marginTop: 6, fontSize: 12, color: T.textSub, fontWeight: 600,
                        }}>
                          {'💬'} {labels.join(' × ')}
                        </div>
                      )
                  })()}

                  {/* Voiceスニペット */}
                  {p.voiceSnippet && (
                    <div style={{
                      marginTop: 10, padding: '8px 12px', background: '#F9F7F3',
                      borderRadius: 8, borderLeft: `3px solid ${T.gold}`,
                    }}>
                      <div style={{ fontSize: 11, color: T.text, lineHeight: 1.6 }}>
                        &ldquo;{p.voiceSnippet}&rdquo;
                      </div>
                      <div style={{ fontSize: 10, color: T.gold, marginTop: 4, fontWeight: 600 }}>
                        続きはプロフィールで →
                      </div>
                    </div>
                  )}

                  {/* 検索マッチ（Dパターン） */}
                  {debouncedQuery && p.voiceMatchCount >= 1 && p.matchedVoice && (
                    <div style={{
                      marginTop: 10, background: '#1A1A2E', borderRadius: 12,
                      padding: '1rem 1.25rem',
                    }}>
                      <p style={{
                        fontSize: 11, color: T.gold, fontWeight: 500,
                        letterSpacing: '0.06em', margin: '0 0 6px',
                      }}>
                        {'💬'} VOICE MATCH
                      </p>
                      <p style={{
                        fontSize: 17, fontWeight: 500, color: '#FAFAF7',
                        lineHeight: 1.5, margin: '0 0 6px',
                      }}>
                        {highlightQuery(p.matchedVoice)}
                      </p>
                      <a
                        href={`/card/${p.id}?tab=voices&highlight=${encodeURIComponent(debouncedQuery)}`}
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: 12, color: 'rgba(250,250,247,0.5)', textDecoration: 'none' }}
                      >
                        続きはプロフィールで →
                      </a>
                    </div>
                  )}
                  {debouncedQuery && p.matchSource === 'proof' && p.matchedProofLabel && (
                    <div style={{ marginTop: 8, fontSize: 11, color: T.textSub, lineHeight: 1.5 }}>
                      <span>{'🔍'} 「{highlightQuery(p.matchedProofLabel)}」にマッチ</span>
                    </div>
                  )}

                  {/* CLIENT COMPOSITION バー */}
                  {(() => {
                    const total = (p.firstCount || 0) + (p.repeaterCount || 0) + (p.regularCount || 0)
                    if (total < 3) return null
                    const firstPct = Math.round(((p.firstCount || 0) / total) * 100)
                    const repeaterPct = Math.round(((p.repeaterCount || 0) / total) * 100)
                    const regularPct = 100 - firstPct - repeaterPct
                    return (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ background: '#E8E0D0', width: `${firstPct}%` }} />
                          <div style={{ background: '#C4A35A', width: `${repeaterPct}%` }} />
                          <div style={{ background: '#1A1A2E', width: `${regularPct}%` }} />
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: T.textMuted }}>
                          <span>{'○'} 初回 {p.firstCount || 0}人</span>
                          <span style={{ color: '#C4A35A' }}>{'●'} リピーター {p.repeaterCount || 0}人</span>
                          <span style={{ color: '#1A1A2E' }}>{'●'} 常連 {p.regularCount || 0}人</span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* プルーフ総数 */}
                  {p.totalProofs > 0 && (
                    <div style={{ marginTop: 6, fontSize: 10, color: T.textMuted }}>
                      プルーフ {p.totalProofs}件
                    </div>
                  )}
                </a>

                {/* §3-0-2: 「紹介リストに追加」（プロが閲覧している時のみ・自分自身のカードには出さない）
                    🟡4レビュー指摘: allowlist期間中は referralWriteEnabled のプロにのみ表示。
                    🟡5レビュー指摘: <a>の外側の兄弟要素として配置する */}
                {showReferralSignals && referralWriteEnabled && p.id !== viewerProId && (
                  <div style={{ marginTop: 10 }}>
                    <button
                      onClick={() => toggleAddPanel(p.id)}
                      style={{
                        background: 'none', border: `1px solid ${T.gold}`, color: T.gold,
                        borderRadius: 8, fontSize: 11, fontWeight: 600, padding: '4px 10px',
                        cursor: 'pointer',
                      }}
                    >
                      {addPanelFor === p.id ? '閉じる' : '＋ 紹介リストに追加'}
                    </button>

                    {/* §3-0-2(第3弾): 共有リスト0件の行き止まりメッセージを廃止し、その場で
                        「新しいリストを作る」入力を直接出す(空リストを先に作る手順・ダッシュボードへ
                        戻る手順の両方を不要にする)。 */}
                    {addPanelFor === p.id && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                        {addStatus[p.id]?.status === 'success' ? (
                          <span style={{ fontSize: 11, color: '#2E7D32' }}>{addStatus[p.id]?.message}</span>
                        ) : ownListsLoading || !ownListsLoaded ? (
                          <span style={{ fontSize: 11, color: T.textMuted }}>読み込み中...</span>
                        ) : ownListsError ? (
                          // ⚪️8レビュー指摘: 取得失敗と0件を区別する
                          <span style={{ fontSize: 11, color: '#B00020' }}>
                            リストの取得に失敗しました
                          </span>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                              {selectableOwnLists.length > 0 && (
                                <select
                                  value={effectiveSelection(p.id)}
                                  onChange={(e) => setSelectedListFor((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                  style={{
                                    padding: '4px 6px', borderRadius: 6, border: `1px solid ${T.cardBorder}`,
                                    fontSize: 11, color: T.dark, maxWidth: '100%',
                                  }}
                                >
                                  {selectableOwnLists.map((l) => (
                                    <option key={l.id} value={l.id}>
                                      {l.visibility === 'private' ? `気になるプロ - ${l.title}` : l.title}
                                    </option>
                                  ))}
                                  <option value={NEW_LIST_SENTINEL}>＋ 新しいリストを作る</option>
                                </select>
                              )}
                            </div>
                            {effectiveSelection(p.id) === NEW_LIST_SENTINEL && (
                              <input
                                value={newListTitleFor[p.id] || ''}
                                onChange={(e) => setNewListTitleFor((prev) => ({ ...prev, [p.id]: e.target.value.slice(0, 200) }))}
                                placeholder="新しいリストの名前（例: 名古屋圏・めまい/ふらつき）"
                                style={{
                                  padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.cardBorder}`,
                                  fontSize: 11, width: '100%', boxSizing: 'border-box' as const,
                                }}
                              />
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                              <button
                                onClick={() => submitAddToList(p.id)}
                                disabled={addStatus[p.id]?.status === 'loading'}
                                style={{
                                  background: T.gold, border: 'none', color: '#fff',
                                  borderRadius: 6, fontSize: 11, fontWeight: 600, padding: '4px 10px',
                                  cursor: addStatus[p.id]?.status === 'loading' ? 'default' : 'pointer',
                                  opacity: addStatus[p.id]?.status === 'loading' ? 0.6 : 1,
                                }}
                              >
                                {addStatus[p.id]?.status === 'loading'
                                  ? '追加中...'
                                  : effectiveSelection(p.id) === NEW_LIST_SENTINEL
                                    ? '作成して追加'
                                    : '追加'}
                              </button>
                              {addStatus[p.id]?.status === 'error' && (
                                <span style={{ fontSize: 11, color: '#B00020' }}>{addStatus[p.id]?.message}</span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                </div>
            ))}
          </div>
        )}

        {/* フッター */}
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1A2E', letterSpacing: '2px' }}>REALPROOF</div>
          <div style={{ fontSize: 10, color: '#888888', marginTop: 4 }}>強みが、あなたを定義する。</div>
        </div>
      </div>
    </div>
  )
}
