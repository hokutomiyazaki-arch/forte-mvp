'use client'

/**
 * §2-2改訂: 受け入れステータス（先行テストのフィードバックによりダッシュボードホーム最上部へ移動）。
 *
 * - トグル自体は🟢(open)⇄🔴(closed)の2値。表示は代理リスト有無から4色(⚪️含む)を導出する。
 * - closed時: 自分が所有する共有リスト(visibility!=='private')から代理リストを選択/解除できる。
 * - open時: 条件メモ(accepting_note)を入力できる(表示は公開カード・候補カードで小さく行う)。
 * - 旧ReferralTab内の「受け入れステータス」ブロックを撤去し、ここへ一本化した(オーファン防止)。
 * - §2-2改訂(4色化・null安全): accepting_status IS NULL(未設定)の実プロが大多数のため、
 *   初期表示で⚪️「未設定」を出す。この状態では「受付を開始する」(→open)と
 *   「受付を停止する」(→closed)の両方を選べるボタンを表示する(一度設定した後は
 *   従来通りの2値トグル1個に戻る)。
 */

import { useEffect, useState } from 'react'
import {
  computeReferralSignal,
  REFERRAL_SIGNAL_DOT,
  REFERRAL_SIGNAL_LABEL,
} from '@/lib/referral-accepting'

interface OwnList {
  id: string
  title: string
  visibility: 'link' | 'private' | 'public'
  /** §2-2改訂: このリスト自体が「有効な代理リスト」か(承諾済み+受付中のメンバーが1名以上)。
   * /api/referral/lists がリストごとに一括判定して返す。 */
  is_valid_delegate?: boolean
}

interface Props {
  initialAcceptingStatus: 'open' | 'closed' | null
  initialAcceptingNote: string | null
  initialDelegateListId: string | null
  onUpdated: (status: 'open' | 'closed', note: string | null, delegateListId: string | null) => void
}

export default function AcceptingStatusWidget({
  initialAcceptingStatus,
  initialAcceptingNote,
  initialDelegateListId,
  onUpdated,
}: Props) {
  // §2-2改訂(4色化・null安全): nullを'closed'に丸めず、そのまま保持する
  // (丸めると⚪️「未設定」と🔴「停止中」の区別ができなくなるため)。
  const [status, setStatus] = useState<'open' | 'closed' | null>(initialAcceptingStatus)
  const [note, setNote] = useState(initialAcceptingNote || '')
  const [delegateListId, setDelegateListId] = useState<string | null>(initialDelegateListId || null)
  const [toggling, setToggling] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [savingDelegate, setSavingDelegate] = useState(false)
  const [lists, setLists] = useState<OwnList[]>([])
  const [listsLoaded, setListsLoaded] = useState(false)
  // レビュー指摘: 保存失敗時に一言のエラーメッセージを表示する(既存のインライン表示流儀に合わせる)
  const [toggleError, setToggleError] = useState(false)
  const [noteError, setNoteError] = useState(false)
  const [delegateError, setDelegateError] = useState(false)

  useEffect(() => {
    // 停止中になって初めて(=代理リスト選択が必要になった時に)リスト一覧を取りに行く
    if (status !== 'closed' || listsLoaded) return
    fetch('/api/referral/lists', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.lists) {
          const shareable = (
            data.lists as Array<{ id: string; title: string; visibility: string; is_valid_delegate?: boolean }>
          )
            .filter((l) => l.visibility !== 'private')
            .map((l) => ({
              id: l.id,
              title: l.title,
              visibility: l.visibility as OwnList['visibility'],
              is_valid_delegate: !!l.is_valid_delegate,
            }))
          setLists(shareable)
        }
      })
      .catch(() => {})
      .finally(() => setListsLoaded(true))
  }, [status, listsLoaded])

  // §2-2改訂: 選択中のdelegateListIdが「有効な代理リスト」か(承諾済み+受付中のメンバーが1名以上)。
  // まだlists未取得の間はfalse(保守側=🔴)に倒す。
  const selectedDelegateList = delegateListId ? lists.find((l) => l.id === delegateListId) : undefined
  const hasValidDelegate = !!selectedDelegateList?.is_valid_delegate
  const signal = computeReferralSignal(status, hasValidDelegate)

  // §2-2改訂(4色化・null安全): status=null(未設定)からの遷移も含め、明示した方向へ更新する共通関数。
  async function setAcceptingStatusTo(next: 'open' | 'closed') {
    if (toggling) return
    setToggling(true)
    setToggleError(false)
    try {
      const res = await fetch('/api/referral/accepting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ accepting_status: next, accepting_note: note }),
      })
      if (res.ok) {
        setStatus(next)
        onUpdated(next, note || null, delegateListId)
      } else {
        setToggleError(true)
      }
    } catch {
      setToggleError(true)
    } finally {
      setToggling(false)
    }
  }

  // 既存の2値トグル(status確定後のみ使用)。未設定(null)からはsetAcceptingStatusToを直接呼ぶ。
  async function toggleStatus() {
    if (!status) return
    await setAcceptingStatusTo(status === 'open' ? 'closed' : 'open')
  }

  async function saveNote() {
    setSavingNote(true)
    setNoteError(false)
    try {
      const res = await fetch('/api/referral/accepting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ accepting_status: status, accepting_note: note }),
      })
      if (res.ok) {
        onUpdated(status, note || null, delegateListId)
      } else {
        setNoteError(true)
      }
    } catch {
      setNoteError(true)
    } finally {
      setSavingNote(false)
    }
  }

  async function saveDelegate(nextListId: string | null) {
    setSavingDelegate(true)
    setDelegateError(false)
    try {
      const res = await fetch('/api/referral/accepting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ accepting_status: status, accepting_note: note, delegate_list_id: nextListId }),
      })
      if (res.ok) {
        setDelegateListId(nextListId)
        onUpdated(status, note || null, nextListId)
      } else {
        setDelegateError(true)
      }
    } catch {
      setDelegateError(true)
    } finally {
      setSavingDelegate(false)
    }
  }

  return (
    <div
      style={{
        background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1px solid #E5E7EB',
        marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{REFERRAL_SIGNAL_DOT[signal]}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1A2E' }}>{REFERRAL_SIGNAL_LABEL[signal]}</span>
        </div>
        {/* §2-2改訂(4色化・null安全): 未設定(null)の間は「開始する」「停止する」の
            両方向ボタンを出す(2値トグル1個では未設定から片方にしか動かせないため)。
            一度どちらかに設定した後は、従来通り2値トグル1個に戻る。 */}
        {status === null ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setAcceptingStatusTo('open')}
              disabled={toggling}
              style={{
                padding: '6px 14px', borderRadius: 999, border: 'none',
                background: '#1A1A2E', color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: toggling ? 'default' : 'pointer', opacity: toggling ? 0.6 : 1,
              }}
            >
              受付を開始する
            </button>
            <button
              onClick={() => setAcceptingStatusTo('closed')}
              disabled={toggling}
              style={{
                padding: '6px 14px', borderRadius: 999, border: '1px solid #C4A35A',
                background: '#fff', color: '#C4A35A', fontSize: 12, fontWeight: 600,
                cursor: toggling ? 'default' : 'pointer', opacity: toggling ? 0.6 : 1,
              }}
            >
              受付を停止する
            </button>
          </div>
        ) : (
          <button
            onClick={toggleStatus}
            disabled={toggling}
            style={{
              padding: '6px 16px', borderRadius: 999, border: 'none',
              background: status === 'open' ? '#1A1A2E' : '#C4A35A',
              color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: toggling ? 'default' : 'pointer', opacity: toggling ? 0.6 : 1,
            }}
          >
            {toggling ? '更新中...' : status === 'open' ? '受付を停止する' : '受付を再開する'}
          </button>
        )}
      </div>
      {toggleError && <div style={{ fontSize: 11, color: '#B00020' }}>更新に失敗しました</div>}
      {/* §2-2改訂: delegateListIdは設定済みだが有効な代理メンバーがいないため🔴になっている場合、
          本人が原因を理解できるよう説明を1行添える(空約束の防止・CEO決定)。 */}
      {status === 'closed' && listsLoaded && delegateListId && !hasValidDelegate && (
        <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.6 }}>
          代理リストが現在有効でないため、停止中と表示されます（承諾済みで受付中のメンバーがいない、またはリストが共有可能な状態ではありません）
        </div>
      )}

      {status === 'open' ? (
        <div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            onBlur={saveNote}
            placeholder="条件メモ（例: めまい・ふらつきのケースのみ／土曜のみ対応可）"
            style={{
              width: '100%', minHeight: 50, padding: '8px 10px', borderRadius: 8,
              border: '1px solid #E5E7EB', fontSize: 12, boxSizing: 'border-box' as const,
              resize: 'vertical' as const,
            }}
          />
          {savingNote && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>保存中...</div>}
          {noteError && <div style={{ fontSize: 11, color: '#B00020', marginTop: 4 }}>保存に失敗しました</div>}
        </div>
      ) : status === 'closed' ? (
        <div>
          {!listsLoaded ? (
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>読み込み中...</div>
          ) : lists.length === 0 ? (
            <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.6 }}>
              紹介リストを作成すると、停止中も代理案内ができます
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
              <select
                value={delegateListId || ''}
                onChange={(e) => saveDelegate(e.target.value || null)}
                disabled={savingDelegate}
                style={{
                  padding: '6px 8px', borderRadius: 8, border: '1px solid #E5E7EB',
                  fontSize: 12, color: '#1A1A2E',
                }}
              >
                <option value="">代理リストを選択しない</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
              {savingDelegate && <span style={{ fontSize: 11, color: '#9CA3AF' }}>保存中...</span>}
              {delegateError && <span style={{ fontSize: 11, color: '#B00020' }}>保存に失敗しました</span>}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
