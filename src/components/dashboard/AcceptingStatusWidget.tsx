'use client'

/**
 * §2-2改訂: 受け入れステータス（先行テストのフィードバックによりダッシュボードホーム最上部へ移動）。
 *
 * - トグル自体は🟢(open)⇄🔴(closed)の2値。表示は代理リスト有無から3色を導出する。
 * - closed時: 自分が所有する共有リスト(visibility!=='private')から代理リストを選択/解除できる。
 * - open時: 条件メモ(accepting_note)を入力できる(表示は公開カード・候補カードで小さく行う)。
 * - 旧ReferralTab内の「受け入れステータス」ブロックを撤去し、ここへ一本化した(オーファン防止)。
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
  const [status, setStatus] = useState<'open' | 'closed'>(
    initialAcceptingStatus === 'open' ? 'open' : 'closed'
  )
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
          const shareable = (data.lists as Array<{ id: string; title: string; visibility: string }>)
            .filter((l) => l.visibility !== 'private')
            .map((l) => ({ id: l.id, title: l.title, visibility: l.visibility as OwnList['visibility'] }))
          setLists(shareable)
        }
      })
      .catch(() => {})
      .finally(() => setListsLoaded(true))
  }, [status, listsLoaded])

  const signal = computeReferralSignal(status, delegateListId)

  async function toggleStatus() {
    if (toggling) return
    const next = status === 'open' ? 'closed' : 'open'
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
      </div>
      {toggleError && <div style={{ fontSize: 11, color: '#B00020' }}>更新に失敗しました</div>}

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
      ) : (
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
      )}
    </div>
  )
}
