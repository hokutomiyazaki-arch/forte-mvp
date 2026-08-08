'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import LinkedText from '@/components/LinkedText'
// §17-28: 相談タブは画面を開いたまま時間が経ちやすい。Clerkのセッションが切れた最初の1回で
// 401になるため、黙って1回だけ再送する（§17-18 と同じ・Voiceにしか入れていなかった）。
import { fetchWithSessionRetry, SESSION_EXPIRED_MESSAGE } from '@/lib/fetch-with-session-retry'

const BODY_MAX = 2000
// CEO指示(2026-08-08): 一覧の1ページあたり件数(完了済み予約リストと同じ)
const PAGE_SIZE = 20

interface Message {
  id: string
  sender: string
  body: string
  created_at: string
}

interface Consultation {
  id: string
  client_name: string
  status: string
  created_at: string
  updated_at: string
  messages: Message[]
  /**
   * §17-8(CEO指示 2026-08-06): このお客さまへのメールがバウンスした。
   * 相談はメールしか預かっていないので、届かない＝クライアントが戻る手段を失っている。
   * 返信を書いても永久に届かないため、その事実を出して畳めるようにする。
   */
  email_failed?: boolean
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * 相談タブ（§16-19・プロ側）
 *
 * 「プロはダッシュボードで返信を書き込むだけ。クライアントにはメールが届く」がこの機能の肝。
 * 未対応(new)→対応中(open)→対応済み(closed)の順に並べ、1件ずつ開いて返信する（CEO指示 2026-08-08）。
 */
export default function ConsultationsTab({
  onUnreadChange,
  initialOpenId,
}: {
  onUnreadChange?: (n: number) => void
  /**
   * §17-6(CEO指摘 2026-08-06): 予約カードの「メッセージを送る」から飛んできたとき、
   * どのスレッドを開けばよいか分からないと書けない。開くスレッドを名指しで受け取る。
   */
  initialOpenId?: string | null
}) {
  const [list, setList] = useState<Consultation[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  // CEO報告(2026-08-08): ?open= で名指しされたスレッドの一時ハイライト（金色リング・数秒で消える）
  const [flashId, setFlashId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // CEO指示(2026-08-06): アーカイブしたスレッドは既定で出さない。切り替えて見返せる。
  const [showArchived, setShowArchived] = useState(false)
  // CEO指示(2026-08-08): 名前検索＋20件ページ送り
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  // §16-25(CEO指示 2026-08-06): 相談を受け付けるかのスイッチ。既定は受け付ける。
  const [accepting, setAccepting] = useState(true)
  const [savingAccepting, setSavingAccepting] = useState(false)
  // §16-27-3: 提案できるメニュー（予約可能なメニューのみ）と、開いているピッカー
  const [menus, setMenus] = useState<{ id: string; name: string; price_text: string }[]>([])
  const [menuPickerId, setMenuPickerId] = useState<string | null>(null)
  // §16-35: 相談チャットから送れる紹介リスト。公開カードに一覧を出すのをやめた代わりの導線。
  const [lists, setLists] = useState<{ id: string; title: string }[]>([])
  const [listPickerId, setListPickerId] = useState<string | null>(null)
  // §16-27-4: 通報はプロ側からも（CEO指摘「お互いに必要」）。理由は必須にしてハードルを上げる。
  const [reportId, setReportId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reportedIds, setReportedIds] = useState<Record<string, boolean>>({})
  // 初回の自動展開は1回だけ（再取得のたびに開き直すと、閉じた人の操作を奪う）
  const openedInitialRef = useRef(false)

  async function load(archived = showArchived) {
    try {
      const res = await fetch(`/api/pro/consultations${archived ? '?archived=1' : ''}`, { cache: 'no-store' })
      if (!res.ok) {
        setList([])
        return
      }
      const json = await res.json()
      const items: Consultation[] = Array.isArray(json.consultations) ? json.consultations : []
      setList(items)
      // §17-6: 名指しで開くよう言われたスレッドがあれば開く（一覧に居るときだけ・1回だけ）。
      // CEO報告(2026-08-08): 開くだけでなく、該当カードへ自動スクロール＋数秒ハイライトする
      // （予約カードの ?booking= と同じ見せ方。描画反映を待って300ms後にDOMを探す）。
      if (initialOpenId && !openedInitialRef.current && items.some(c => c.id === initialOpenId)) {
        openedInitialRef.current = true
        setOpenId(initialOpenId)
        setFlashId(initialOpenId)
        setTimeout(() => {
          document.getElementById(`consultation-card-${initialOpenId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 300)
        setTimeout(() => setFlashId(null), 3800)
      }
      if (typeof json.accepting === 'boolean') setAccepting(json.accepting)
      if (Array.isArray(json.menus)) setMenus(json.menus)
      if (Array.isArray(json.lists)) setLists(json.lists)
      // アーカイブ表示中の件数でバッジを上書きしない（通常一覧のときだけ報告する）
      if (!archived && onUnreadChange) onUnreadChange(items.filter(c => c.status === 'new').length)
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // §17-28: 401時にセッションを取り直すために使う（通常時は何もしない）
  const { getToken } = useAuth()

  async function sendReply(id: string) {
    const snapshot = draft.trim()
    if (!snapshot || sendingId) return
    setSendingId(id)
    setError('')
    setNotice('')
    try {
      const res = await fetchWithSessionRetry(`/api/pro/consultations/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ body: snapshot }),
      }, getToken)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        // §17-28: 再送しても401なら本当にログインが切れている。入力は消さない。
        if (res.status === 401) {
          setError(SESSION_EXPIRED_MESSAGE)
          return
        }
        setError(json.error === 'limit_reached' ? 'このやりとりは上限に達しました。' : '送信できませんでした。')
        return
      }
      setDraft('')
      // メールが飛ばなかった場合は黙って成功にしない（相手に届いていないため）
      setNotice(json.delivered
        ? 'お客さんにメールを送りました。'
        : '返信を保存しましたが、メールを送れませんでした。しばらくしてからもう一度お試しください。')
      await load()
    } catch {
      setError('送信できませんでした。')
    } finally {
      setSendingId(null)
    }
  }

  async function toggleAccepting(next: boolean) {
    if (savingAccepting) return
    setSavingAccepting(true)
    setError('')
    // 楽観更新はしない。保存できたことを確認してから反映する
    // （migration 051 未実行だと保存できず、スイッチだけ動いて見える事故を避ける）。
    try {
      const res = await fetchWithSessionRetry('/api/pro/consultations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ accepting: next }),
      }, getToken)
      if (!res.ok) {
        setError('設定を保存できませんでした。時間をおいてお試しください。')
        return
      }
      setAccepting(next)
    } catch {
      setError('設定を保存できませんでした。')
    } finally {
      setSavingAccepting(false)
    }
  }

  /** §16-27-3 相談→予約の接続。選んだメニューがカードとしてスレッドに入る。 */
  async function proposeMenu(consultationId: string, menuId: string) {
    if (sendingId) return
    setSendingId(consultationId)
    setError('')
    setNotice('')
    try {
      const res = await fetchWithSessionRetry(`/api/pro/consultations/${consultationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ menu_id: menuId }),
      }, getToken)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error === 'menu_not_found' ? 'このメニューは提案できません。' : '提案を送れませんでした。')
        return
      }
      setMenuPickerId(null)
      setNotice(json.delivered ? 'メニューを提案しました。' : 'メニューを提案しましたが、メールを送れませんでした。')
      await load()
    } catch {
      setError('提案を送れませんでした。')
    } finally {
      setSendingId(null)
    }
  }

  /** §16-35 紹介リストを送る。ワンクリックで「◯◯さんが紹介した」実体を残す。 */
  async function sendList(consultationId: string, listId: string) {
    if (sendingId) return
    setSendingId(consultationId)
    setError('')
    setNotice('')
    try {
      const res = await fetchWithSessionRetry(`/api/pro/consultations/${consultationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ list_id: listId }),
      }, getToken)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error === 'list_not_found' ? 'このリストは送れません。' : 'リストを送れませんでした。')
        return
      }
      setListPickerId(null)
      setNotice(json.delivered ? '紹介リストを送りました。' : '紹介リストを送りましたが、メールを送れませんでした。')
      await load()
    } catch {
      setError('リストを送れませんでした。')
    } finally {
      setSendingId(null)
    }
  }

  /** §16-36 送信の取り消し。メールは既に出ているのでやりとり画面から消すだけ。 */
  async function undoMessage(consultationId: string, messageId: string) {
    if (sendingId) return
    if (!window.confirm('この送信を取り消しますか？\n\nやりとり画面からは消えますが、お客さんに届いたメールは取り消せません。')) return
    setSendingId(consultationId)
    setError('')
    setNotice('')
    try {
      const res = await fetchWithSessionRetry(`/api/pro/consultations/${consultationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ undo_message_id: messageId }),
      }, getToken)
      if (!res.ok) {
        setError('取り消せませんでした。')
        return
      }
      setNotice('送信を取り消しました。')
      await load()
    } catch {
      setError('取り消せませんでした。')
    } finally {
      setSendingId(null)
    }
  }

  /** §17-8 メールが届かないやりとりを丸ごと消す（CEO指示 2026-08-06） */
  async function deleteThread(consultationId: string) {
    if (sendingId) return
    if (!window.confirm(
      'このやりとりを削除しますか？\n\n' +
      'お客さまにメールが届いていないため、返信しても届きません。\n' +
      'この操作は取り消せません。'
    )) return
    setSendingId(consultationId)
    setError('')
    setNotice('')
    try {
      const res = await fetchWithSessionRetry(`/api/pro/consultations/${consultationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ delete_thread: true }),
      }, getToken)
      if (!res.ok) {
        setError('削除できませんでした。時間をおいてお試しください。')
        return
      }
      setOpenId(null)
      setNotice('やりとりを削除しました。')
      await load()
    } catch {
      setError('削除できませんでした。')
    } finally {
      setSendingId(null)
    }
  }

  async function sendReport(consultationId: string) {
    if (reportReason.trim().length < 10 || sendingId) return
    setSendingId(consultationId)
    setError('')
    try {
      const res = await fetchWithSessionRetry(`/api/pro/consultations/${consultationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ report_reason: reportReason.trim() }),
      }, getToken)
      if (!res.ok) {
        // 届いていないのに「受け付けました」と出さない
        setError('通報を送信できませんでした。時間をおいてお試しください。')
        return
      }
      setReportedIds(prev => ({ ...prev, [consultationId]: true }))
      setReportId(null)
      setReportReason('')
    } catch {
      setError('通報を送信できませんでした。')
    } finally {
      setSendingId(null)
    }
  }

  async function updateStatus(id: string, status: string) {
    setError('')
    try {
      const res = await fetchWithSessionRetry(`/api/pro/consultations/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ status }),
      }, getToken)
      if (!res.ok) {
        // 'archived' が DB の CHECK 制約で弾かれるケースがある（migration 050 の確認手順）。
        // 黙って失敗すると「押したのに消えない」になるので必ず出す。
        setError(status === 'archived'
          ? 'アーカイブできませんでした。時間をおいてお試しください。'
          : '変更できませんでした。')
        return
      }
      setOpenId(null)
      await load()
    } catch {
      setError('変更できませんでした。')
    }
  }

  if (loading) {
    return <p style={{ fontSize: 13, color: '#9CA3AF' }}>読み込み中…</p>
  }

  const acceptingSwitch = (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
      padding: '14px 16px', marginBottom: 16,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>
          {accepting ? 'ご相談を受け付けています' : 'ご相談を停止しています'}
        </div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4, lineHeight: 1.6 }}>
          {accepting
            ? 'カードに「相談する」が表示されます。'
            : 'カードから「相談する」が消えます。予約の受付はそのままです。'}
        </div>
      </div>
      <div
        role="switch"
        aria-checked={accepting}
        aria-label="相談の受付"
        onClick={() => toggleAccepting(!accepting)}
        style={{
          width: 48, height: 28, borderRadius: 14, flexShrink: 0,
          background: accepting ? '#C4A35A' : '#D1D5DB',
          position: 'relative', transition: 'background 0.2s',
          cursor: savingAccepting ? 'default' : 'pointer',
          opacity: savingAccepting ? 0.6 : 1,
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 3, left: accepting ? 23 : 3,
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
    </div>
  )

  const archiveToggle = (
    <button
      type="button"
      onClick={() => { const next = !showArchived; setShowArchived(next); setOpenId(null); setSearchQuery(''); setPage(0); setLoading(true); load(next) }}
      style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        fontSize: 12, color: '#C4A35A', fontWeight: 600,
      }}
    >
      {showArchived ? '← 受信箱に戻る' : 'アーカイブを見る'}
    </button>
  )

  if (list.length === 0) {
    return (
      <div>
      {acceptingSwitch}
      {error && <p style={{ fontSize: 12, color: '#E24B4A', marginBottom: 10 }}>{error}</p>}
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, textAlign: 'center', border: '1px solid #E5E7EB' }}>
        <div style={{ textAlign: 'right', marginBottom: 8 }}>{archiveToggle}</div>
        <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.9 }}>
          {showArchived ? 'アーカイブしたご相談はありません。' : 'まだご相談は届いていません。'}
        </p>
        <p style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.9, marginTop: 10 }}>
          あなたのカードの「相談する」から、お客さんが日時を決めずに問い合わせできます。
          届いたらここに表示され、メールかLINEでもお知らせします。
        </p>
      </div>
      </div>
    )
  }

  // CEO指示(2026-08-08): 未対応(new)→対応中(open)→対応済み(closed)の順に上から並べる。
  // 同じ状態なら新しい順。archivedはアーカイブ表示側にしか出ないため実質同率(最後尾)。
  const STATUS_SORT_RANK: Record<string, number> = { new: 0, open: 1, closed: 2 }
  const sorted = [...list].sort((a, b) => {
    const an = STATUS_SORT_RANK[a.status] ?? 3
    const bn = STATUS_SORT_RANK[b.status] ?? 3
    return an - bn || b.updated_at.localeCompare(a.updated_at)
  })

  // CEO指示(2026-08-08): 名前検索＋20件ページ送り(完了済み予約リストと同じ流儀。アーカイブ表示にも効く)
  const trimmedQuery = searchQuery.trim()
  const filtered = trimmedQuery ? sorted.filter(c => (c.client_name || '').includes(trimmedQuery)) : sorted
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  return (
    <div style={{ paddingBottom: 40 }}>
      {acceptingSwitch}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.8, margin: 0 }}>
          {showArchived
            ? 'アーカイブしたご相談です。戻すと受信箱に再表示されます。'
            : 'カードの「相談する」から届いたご相談です。ここに返信を書くと、お客さんにメールで届きます。'}
        </p>
        <div style={{ flexShrink: 0, paddingTop: 2 }}>{archiveToggle}</div>
      </div>

      <input
        type="text"
        value={searchQuery}
        onChange={(e) => { setSearchQuery(e.target.value); setPage(0); setOpenId(null) }}
        placeholder="お名前で検索"
        style={{
          width: '100%', padding: '9px 12px', fontSize: 14, boxSizing: 'border-box',
          border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 10, background: '#fff',
        }}
      />
      {trimmedQuery && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#9CA3AF', fontSize: 13 }}>
          「{trimmedQuery}」に一致するご相談はありません
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pageItems.map(c => {
          const isOpen = openId === c.id
          const isNew = c.status === 'new'
          const last = c.messages[c.messages.length - 1]
          return (
            <div key={c.id} id={`consultation-card-${c.id}`} style={{
              background: '#fff', border: `1px solid ${flashId === c.id ? '#C4A35A' : isNew ? '#C4A35A' : '#E5E7EB'}`,
              boxShadow: flashId === c.id ? '0 0 0 4px rgba(196,163,90,0.35)' : 'none',
              transition: 'box-shadow 0.5s, border-color 0.5s',
              borderRadius: 12, overflow: 'hidden',
            }}>
              <button
                type="button"
                onClick={() => { setOpenId(isOpen ? null : c.id); setDraft(''); setError(''); setNotice('') }}
                style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 12, padding: '14px 16px', background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* レビュー指摘(2026-08-08): バッジ拡大に伴い長い氏名は省略記号で切る(バッジのはみ出し防止) */}
                    <span style={{
                      fontSize: 14, fontWeight: 700, color: '#1A1A2E',
                      minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{c.client_name}</span>
                    {/* CEO指示(2026-08-08): 未対応/対応中/対応済みのラベルを常に表示(§0-6: 13px以上・絵文字なし)。
                        旧「未返信」(new)・グレー文字「対応済み」(closed)を3状態の統一バッジに置き換え。 */}
                    {(c.status === 'new' || c.status === 'open' || c.status === 'closed') && (
                      <span style={{
                        fontSize: 13, fontWeight: 700, padding: '2px 10px', borderRadius: 999,
                        flexShrink: 0,
                        ...(c.status === 'new'
                          ? { background: '#C4A35A', color: '#1A1A2E' }
                          : c.status === 'open'
                            ? { background: '#DBEAFE', color: '#1D4ED8' }
                            : { background: '#F1F5F9', color: '#64748B' }),
                      }}>
                        {c.status === 'new' ? '未対応' : c.status === 'open' ? '対応中' : '対応済み'}
                      </span>
                    )}
                    {/* §17-8: 開かなくても分かるようにする（返信を書く前に気づけること） */}
                    {c.email_failed && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: '#FFF3F3', color: '#B00020', border: '1px solid #F0BDBD',
                      }}>メール届かず</span>
                    )}
                  </div>
                  {last && !isOpen && (
                    <div style={{
                      fontSize: 12, color: '#6B7280', marginTop: 4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {last.sender === 'pro' ? 'あなた: ' : ''}{last.body}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                    {formatDate(c.updated_at)}
                  </div>
                </div>
                <span style={{ color: '#C4A35A', fontSize: 16, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div style={{ background: '#F9FAFB', borderTop: '1px solid #E5E7EB', padding: 16 }}>
                  {/* §17-8(CEO指示 2026-08-06): メールが届かないやりとりは、その事実をここに出す。
                      相談はメールしか預かっていないので、クライアントは戻る手段を失っている
                      （予約と違って電話番号が無い）。返信を書かせても無駄なので、畳める形にする。 */}
                  {c.email_failed && (
                    <div style={{
                      background: '#FFF3F3', border: '1px solid #F0BDBD', borderRadius: 10,
                      padding: '12px 14px', marginBottom: 16,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#B00020', marginBottom: 4 }}>
                        このお客さまにメールが届いていません
                      </div>
                      <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.7, marginBottom: 10 }}>
                        メールアドレスの入力間違いの可能性があります。
                        お客さまはこのやりとりを開くことができないため、返信しても届きません。
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteThread(c.id)}
                        disabled={sendingId === c.id}
                        style={{
                          padding: '8px 14px', borderRadius: 8, border: 'none',
                          background: '#E24B4A', color: '#fff', fontSize: 12, fontWeight: 700,
                          cursor: sendingId === c.id ? 'default' : 'pointer',
                          opacity: sendingId === c.id ? 0.6 : 1,
                        }}
                      >
                        このやりとりを削除する
                      </button>
                    </div>
                  )}

                  {/* §17-6: 予約から始めたスレッドは空の状態で並ぶ。何をすればよいか書いておく
                      （空欄だけ出されても、送れるのかどうか分からない）。 */}
                  {c.messages.length === 0 && (
                    <div style={{
                      background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10,
                      padding: '12px 14px', marginBottom: 16,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A2E', marginBottom: 4 }}>
                        まだメッセージはありません
                      </div>
                      <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.7 }}>
                        最初の1通を書くと、お客さんにメールでお知らせが届きます。
                        お客さんはメール内のリンクからそのまま返信できます。
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    {c.messages.map(m => {
                      const mine = m.sender === 'pro'
                      return (
                        <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                          <div style={{ maxWidth: '85%' }}>
                            <div style={{
                              background: mine ? '#1A1A2E' : '#fff',
                              color: mine ? '#FAFAF7' : '#1A1A2E',
                              border: mine ? 'none' : '1px solid #E5E7EB',
                              borderRadius: 12, padding: '10px 12px',
                              fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            }}>
                              {/* §17-14: URLはリンクにする。自分の吹き出しは濃色地なので色を変える */}
                              <LinkedText text={m.body} variant={mine ? 'onDark' : 'onLight'} />
                            </div>
                            <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>
                              {mine ? 'あなた' : c.client_name}・{formatDate(m.created_at)}
                              {/* §16-36: 誤送信の取り消し。自分の発言だけ。 */}
                              {mine && c.status !== 'archived' && (
                                <>
                                  {' '}
                                  <button
                                    type="button"
                                    onClick={() => undoMessage(c.id, m.id)}
                                    disabled={sendingId === c.id}
                                    style={{
                                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                      fontSize: 10, color: '#9CA3AF', textDecoration: 'underline',
                                    }}
                                  >
                                    取り消す
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* 連絡先は出さない（CEO決定 2026-08-06「完全に消して。リードはこっちで握る」）。
                      返信はここに書けばメールが飛ぶので、プロ側がアドレスを持つ必要がない。
                      APIレスポンスからも外してある。 */}

                  {/* §17-28(CEO質問 2026-08-07「他に相談に適用してない同じ問題修正はない？」):
                      §17-22 で予約側の「メッセージを送る」を消したのと**まったく同じ問題**が
                      ここに残っていた。すぐ上の赤ブロックで「返信しても届きません」と言いながら、
                      その真下に返信欄と「返信する」ボタンを出していた。
                      押せるだけ無駄で、しかも「送れた」と誤解させる。
                      メールが死んでいる間は畳んで、削除／アーカイブだけ残す。 */}
                  {c.email_failed && c.status !== 'closed' && c.status !== 'archived' && (
                    <div style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.7 }}>
                      お客さまに届く手段が無いため、返信欄は表示していません。
                      上の「このやりとりを削除する」で片付けられます。
                    </div>
                  )}

                  {!c.email_failed && c.status !== 'closed' && c.status !== 'archived' && (
                    <>
                      <textarea
                        value={draft}
                        maxLength={BODY_MAX}
                        onChange={e => setDraft(e.target.value)}
                        rows={4}
                        placeholder="返信を書くと、お客さんにメールで届きます"
                        style={{
                          width: '100%', padding: '10px 12px', fontSize: 14,
                          border: '1px solid #E5E7EB', borderRadius: 8, boxSizing: 'border-box',
                          resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7, background: '#fff',
                        }}
                      />
                      <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'right', marginTop: 4 }}>
                        {draft.length} / {BODY_MAX}
                      </div>
                      {error && <p style={{ fontSize: 12, color: '#E24B4A', marginTop: 4 }}>{error}</p>}
                      {notice && <p style={{ fontSize: 12, color: '#2E7D32', marginTop: 4, lineHeight: 1.7 }}>{notice}</p>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                          type="button"
                          onClick={() => sendReply(c.id)}
                          disabled={!draft.trim() || sendingId === c.id}
                          style={{
                            flex: 1, padding: '12px 16px', borderRadius: 8, border: 'none',
                            background: draft.trim() && sendingId !== c.id ? '#C4A35A' : '#E5E7EB',
                            color: draft.trim() && sendingId !== c.id ? '#1A1A2E' : '#9CA3AF',
                            fontSize: 14, fontWeight: 700,
                            cursor: draft.trim() && sendingId !== c.id ? 'pointer' : 'not-allowed',
                          }}
                        >
                          {sendingId === c.id ? '送信中…' : '返信する'}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStatus(c.id, 'closed')}
                          style={{
                            padding: '12px 16px', borderRadius: 8, border: '1px solid #E5E7EB',
                            background: '#fff', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          対応済みにする
                        </button>
                      </div>

                      {/* §16-27-3 相談→予約の接続。相談で温まった人を、その場で予約に接続する。
                          出せるのは「予約可能なメニュー」だけ（料金あり × 紹介予約を受け付ける）。
                          0件のときはボタン自体を出さない（押しても選べないため）。 */}
                      {menus.length > 0 && (
                        menuPickerId === c.id ? (
                          <div style={{
                            marginTop: 12, background: '#fff', border: '1px solid #E5E7EB',
                            borderRadius: 10, padding: 12,
                          }}>
                            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
                              提案するメニューを選んでください
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {menus.map(menu => (
                                <button
                                  key={menu.id}
                                  type="button"
                                  onClick={() => proposeMenu(c.id, menu.id)}
                                  disabled={sendingId === c.id}
                                  style={{
                                    textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                                    border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer',
                                  }}
                                >
                                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A2E' }}>{menu.name}</div>
                                  <div style={{ fontSize: 12, color: '#C4A35A', marginTop: 2 }}>{menu.price_text}</div>
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => setMenuPickerId(null)}
                              style={{
                                marginTop: 10, background: 'none', border: 'none', padding: 0,
                                fontSize: 12, color: '#9CA3AF', cursor: 'pointer',
                              }}
                            >
                              やめる
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setMenuPickerId(c.id)}
                            style={{
                              width: '100%', marginTop: 8, padding: '12px 16px', borderRadius: 8,
                              border: '1.5px solid #C4A35A', background: '#fff', color: '#C4A35A',
                              fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            このメニューを提案する
                          </button>
                        )
                      )}

                      {/* §16-35 紹介リストを送る（CEO決定 2026-08-06）。
                          公開カードに一覧を出すのをやめた代わりの導線。
                          こちらは「◯◯さんが紹介した」という実体が残るので、ちゃんと紹介になる。
                          共有可能なリストが無い人にはボタンを出さない（押しても選べないため）。 */}
                      {lists.length > 0 && (
                        listPickerId === c.id ? (
                          <div style={{
                            marginTop: 8, background: '#fff', border: '1px solid #E5E7EB',
                            borderRadius: 10, padding: 12,
                          }}>
                            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
                              送る紹介リストを選んでください
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {lists.map(l => (
                                <button
                                  key={l.id}
                                  type="button"
                                  onClick={() => sendList(c.id, l.id)}
                                  disabled={sendingId === c.id}
                                  style={{
                                    textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                                    border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer',
                                    fontSize: 13, fontWeight: 700, color: '#1A1A2E',
                                  }}
                                >
                                  {l.title}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => setListPickerId(null)}
                              style={{
                                marginTop: 10, background: 'none', border: 'none', padding: 0,
                                fontSize: 12, color: '#9CA3AF', cursor: 'pointer',
                              }}
                            >
                              やめる
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setListPickerId(c.id)}
                            style={{
                              width: '100%', marginTop: 8, padding: '12px 16px', borderRadius: 8,
                              border: '1.5px solid #1A1A2E', background: '#fff', color: '#1A1A2E',
                              fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            紹介リストを送る
                          </button>
                        )
                      )}
                    </>
                  )}

                  {(c.status === 'closed' || c.status === 'archived') && (
                    <button
                      type="button"
                      onClick={() => updateStatus(c.id, 'open')}
                      style={{
                        padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB',
                        background: '#fff', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {c.status === 'archived' ? '受信箱に戻す' : 'やりとりを再開する'}
                    </button>
                  )}

                  {/* CEO報告(2026-08-06)「対応済みカードがアーカイブできない」の修正。
                      返信ブロックの中に置いていたため、status='closed' で返信欄ごと
                      隠れてボタンも消えていた。返信の可否と関係なく押せる位置へ出す。 */}
                  {c.status !== 'archived' && (
                    <button
                      type="button"
                      onClick={() => updateStatus(c.id, 'archived')}
                      style={{
                        display: 'block', marginTop: 12, background: 'none', border: 'none', padding: 0,
                        fontSize: 12, color: '#9CA3AF', cursor: 'pointer', textDecoration: 'underline',
                      }}
                    >
                      アーカイブする（一覧から隠す）
                    </button>
                  )}

                  {/* §16-27-4 通報（プロ側）。小さく置く。理由は必須。
                      「通常、運営はチャットを閲覧しません。通報があった場合のみ確認します」を
                      ここにも書く（UIと規約の両方に出す方針）。 */}
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #E5E7EB' }}>
                    <p style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.8, marginBottom: 6 }}>
                      通常、運営はチャットを閲覧しません。通報があった場合のみ確認します。
                    </p>
                    {reportedIds[c.id] ? (
                      <p style={{ fontSize: 11, color: '#2E7D32' }}>通報を受け付けました。</p>
                    ) : reportId === c.id ? (
                      <div>
                        <textarea
                          value={reportReason}
                          maxLength={500}
                          onChange={e => setReportReason(e.target.value)}
                          rows={3}
                          placeholder="どのような点が問題でしたか（10文字以上）"
                          style={{
                            width: '100%', padding: '8px 10px', fontSize: 13,
                            border: '1px solid #E5E7EB', borderRadius: 8, boxSizing: 'border-box',
                            resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7, background: '#fff',
                          }}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                          <button
                            type="button"
                            onClick={() => sendReport(c.id)}
                            disabled={reportReason.trim().length < 10 || sendingId === c.id}
                            style={{
                              padding: '8px 14px', borderRadius: 8, border: 'none',
                              background: reportReason.trim().length >= 10 ? '#E24B4A' : '#E5E7EB',
                              color: reportReason.trim().length >= 10 ? '#fff' : '#9CA3AF',
                              fontSize: 12, fontWeight: 700,
                              cursor: reportReason.trim().length >= 10 ? 'pointer' : 'default',
                            }}
                          >
                            通報する
                          </button>
                          <button
                            type="button"
                            onClick={() => { setReportId(null); setReportReason('') }}
                            style={{
                              padding: '8px 14px', borderRadius: 8, border: '1px solid #E5E7EB',
                              background: '#fff', color: '#6B7280', fontSize: 12, cursor: 'pointer',
                            }}
                          >
                            やめる
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setReportId(c.id); setReportReason('') }}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          fontSize: 11, color: '#9CA3AF', textDecoration: 'underline',
                        }}
                      >
                        通報する
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {pageCount > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 14 }}>
          <button
            type="button"
            onClick={() => { setPage(Math.max(0, safePage - 1)); setOpenId(null) }}
            disabled={safePage === 0}
            style={{
              padding: '7px 14px', borderRadius: 8, border: '1px solid #D1D5DB',
              background: '#fff', fontSize: 13, fontWeight: 600,
              color: safePage === 0 ? '#D1D5DB' : '#1A1A2E',
              cursor: safePage === 0 ? 'default' : 'pointer',
            }}
          >
            ← 前へ
          </button>
          <span style={{ fontSize: 13, color: '#6B7280' }}>{safePage + 1} / {pageCount}</span>
          <button
            type="button"
            onClick={() => { setPage(Math.min(pageCount - 1, safePage + 1)); setOpenId(null) }}
            disabled={safePage >= pageCount - 1}
            style={{
              padding: '7px 14px', borderRadius: 8, border: '1px solid #D1D5DB',
              background: '#fff', fontSize: 13, fontWeight: 600,
              color: safePage >= pageCount - 1 ? '#D1D5DB' : '#1A1A2E',
              cursor: safePage >= pageCount - 1 ? 'default' : 'pointer',
            }}
          >
            次へ →
          </button>
        </div>
      )}
    </div>
  )
}
