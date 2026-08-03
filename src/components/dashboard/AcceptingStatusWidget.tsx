'use client'

/**
 * §2-2改訂（先行テスト第3弾・CEO最終確認）: 受け入れステータスは
 * ダッシュボード見出しの直上に、背景なしの「3段スライダー」として置く。
 * 🔴停止中 ⇔ 🟡代理リストで案内 ⇔ 🟢受付中 の3ポジションから直接選べるが、
 * DBは open/closed の2値のまま変えない：
 *   - 🟢選択 → PATCH accepting_status='open'
 *   - 🔴選択 → PATCH accepting_status='closed' + delegate_list_id=null
 *     （代理が有効だとシグナルが🟡になってしまうため、🔴を直接選ぶ場合は
 *     delegate_list_idを明示的にnullへ落として確実に🔴にする）
 *   - 🟡選択 → 複合操作。既に「有効な代理リスト」(is_valid_delegate)が選択済みなら
 *     accepting_status='closed'のみPATCH（delegate_list_id維持）。
 *     有効な代理リストが無い/未選択の場合は🟡を確定させず、代理リスト選択UIを開いて誘導する
 *     （空約束の防止・CEO決定）
 *
 * NULL（未設定）はノブ🟢位置として表示するが、PATCHは送らない
 * （fail-open。ユーザーが操作して初めて明示値を送る）。
 *
 * 3色インジケータの導出は src/lib/referral-accepting.ts の computeReferralSignal に集約。
 */

import { useEffect, useRef, useState } from 'react'
import {
  computeReferralSignal,
  REFERRAL_SIGNAL_DOT,
  type ReferralSignal,
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
  /** 軽微指摘: allowlist外プロ(referralEnabled=false)では代理リスト機能(🟡)がまだ実行不能なため、
   * 🟡セグメントをdisabledにし誘導文を差し替える。既存呼び出しを壊さないようオプショナル+デフォルトtrue。 */
  canManageLists?: boolean
}

const SEGMENTS: ReferralSignal[] = ['closed', 'delegate', 'open']
const SEGMENT_INDEX: Record<ReferralSignal, number> = { closed: 0, delegate: 1, open: 2 }
const SEGMENT_LABEL: Record<ReferralSignal, string> = {
  closed: '停止中',
  delegate: '代理案内',
  open: '受付中',
}

export default function AcceptingStatusWidget({
  initialAcceptingStatus,
  initialAcceptingNote,
  initialDelegateListId,
  onUpdated,
  canManageLists = true,
}: Props) {
  // 先行テスト第3弾: DB上のNULLはそのまま保持するが、表示・分岐は effectiveStatus (下記) で
  // 'open' に丸める(PATCH送信時のみ明示値を送るため、stateそのものはnull保持で問題ない)。
  const [status, setStatus] = useState<'open' | 'closed' | null>(initialAcceptingStatus)
  const [note, setNote] = useState(initialAcceptingNote || '')
  // 🟡6レビュー指摘: 最後に保存された値を保持し、onBlurで未変更ならPATCHを送らない
  // (NULLユーザーがtextareaにフォーカスしただけで accepting_status='open' が明示値として書かれる事故防止)
  const [savedNote, setSavedNote] = useState(initialAcceptingNote || '')
  const [delegateListId, setDelegateListId] = useState<string | null>(initialDelegateListId || null)
  const [toggling, setToggling] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [lists, setLists] = useState<OwnList[]>([])
  const [listsLoaded, setListsLoaded] = useState(false)
  // レビュー指摘: 保存失敗時に一言のエラーメッセージを表示する(既存のインライン表示流儀に合わせる)
  const [toggleError, setToggleError] = useState(false)
  const [noteError, setNoteError] = useState(false)
  // 🟡を選ぼうとしたが有効な代理リストが未選択/存在しない場合、確定させず選択UIを開く
  const [yellowSetupMode, setYellowSetupMode] = useState(false)
  // §2-2: 条件メモは表示モード⇔編集モード。既定は表示モード。
  const [noteEditing, setNoteEditing] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const justSavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 「保存しました」フィードバックのタイマーをアンマウント時にクリーンアップ
  useEffect(() => {
    return () => {
      if (justSavedTimeoutRef.current) clearTimeout(justSavedTimeoutRef.current)
    }
  }, [])

  // 先行テスト第3弾: NULL(未設定)は'open'として扱う(fail-open)。UI分岐は全てこの値を使う。
  const effectiveStatus: 'open' | 'closed' = status ?? 'open'

  // 自分の共有可能なリスト(private以外)を一覧取得しておく。🟡選択時の有効判定に必要なため
  // 現在のステータスに関わらず一度だけ読み込む。
  useEffect(() => {
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
  }, [])

  const validLists = lists.filter((l) => l.is_valid_delegate)

  // §2-2改訂: 選択中のdelegateListIdが「有効な代理リスト」か(承諾済み+受付中のメンバーが1名以上)。
  // まだlists未取得の間はfalse(保守側=🔴)に倒す。
  const selectedDelegateList = delegateListId ? lists.find((l) => l.id === delegateListId) : undefined
  const hasValidDelegate = !!selectedDelegateList?.is_valid_delegate
  const signal = computeReferralSignal(status, hasValidDelegate)

  // 明示的なPATCH。delegateListId を渡した時のみ delegate_list_id を更新する(未指定なら現状維持)。
  async function commitStatus(next: 'open' | 'closed', delegateOpt?: string | null) {
    if (toggling) return
    setToggling(true)
    setToggleError(false)
    try {
      // R6レビュー指摘(重大): 編集中の下書き(note)ではなく保存済みの値(savedNote)のみ送る。
      // 下書きを乗せると「保存する」を押していない文言がPATCHで確定し公開カード/紹介ページに出てしまう(§0-7違反)。
      const body: Record<string, unknown> = { accepting_status: next, accepting_note: savedNote }
      if (delegateOpt !== undefined) body.delegate_list_id = delegateOpt
      const res = await fetch('/api/referral/accepting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setStatus(next)
        const nextDelegateListId = delegateOpt !== undefined ? delegateOpt : delegateListId
        if (delegateOpt !== undefined) setDelegateListId(delegateOpt)
        setYellowSetupMode(false)
        onUpdated(next, savedNote || null, nextDelegateListId)
      } else {
        setToggleError(true)
      }
    } catch {
      setToggleError(true)
    } finally {
      setToggling(false)
    }
  }

  // 3段スライダーの選択ハンドラ
  async function selectSegment(target: ReferralSignal) {
    if (toggling) return
    // R6レビュー指摘: スライダー操作時は条件メモの未保存下書きを破棄する(編集途中の文言が
    // 後続操作で意図せず確定・公開されるのを防ぐ)
    setNote(savedNote)
    setNoteEditing(false)
    if (target === 'open') {
      setYellowSetupMode(false)
      await commitStatus('open')
      return
    }
    if (target === 'closed') {
      // 🔴を直接選ぶ場合、代理が有効だと🟡表示になってしまうため delegate_list_id を明示的に外す
      setYellowSetupMode(false)
      await commitStatus('closed', null)
      return
    }
    // target === 'delegate'（🟡）
    // 軽微指摘: allowlist外(canManageLists=false)では代理リスト機能はまだ実行不能なため確定させない
    if (!canManageLists) return
    if (delegateListId && validLists.some((l) => l.id === delegateListId)) {
      // 既に有効な代理リストが選択済み → そのままclosedにする
      await commitStatus('closed', delegateListId)
    } else {
      // 有効な代理リストが無い/未選択 → 確定させず選択UIへ誘導する
      setYellowSetupMode(true)
    }
  }

  // §2-2: 保存ボタン押下時のみPATCHを送る(onBlur自動保存は廃止)。
  // NULL(未設定)ユーザーが触っただけで accepting_status が確定する事故を防ぐため、
  // 未変更なら通信せず編集モードを閉じるだけにする(dirtyチェックは維持)。
  async function saveNote() {
    if (note === savedNote) {
      setNoteEditing(false)
      return
    }
    setSavingNote(true)
    setNoteError(false)
    try {
      const res = await fetch('/api/referral/accepting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ accepting_status: effectiveStatus, accepting_note: note }),
      })
      if (res.ok) {
        setSavedNote(note)
        onUpdated(effectiveStatus, note || null, delegateListId)
        setNoteEditing(false)
        setJustSaved(true)
        if (justSavedTimeoutRef.current) clearTimeout(justSavedTimeoutRef.current)
        justSavedTimeoutRef.current = setTimeout(() => setJustSaved(false), 2500)
      } else {
        setNoteError(true)
      }
    } catch {
      setNoteError(true)
    } finally {
      setSavingNote(false)
    }
  }

  function cancelNoteEdit() {
    setNote(savedNote)
    setNoteError(false)
    setNoteEditing(false)
  }

  return (
    <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 3段スライダー本体（セグメント型トグル。ノブ位置=現在のシグナル） */}
      <div
        style={{
          position: 'relative', display: 'flex', background: '#F3F4F6', borderRadius: 999,
          padding: 3,
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute', top: 3, bottom: 3, left: `calc(${SEGMENT_INDEX[signal] * (100 / 3)}% + 2px)`,
            width: 'calc(33.333% - 4px)', background: '#fff', borderRadius: 999,
            boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transition: 'left 0.2s ease', zIndex: 0,
          }}
        />
        {SEGMENTS.map((seg) => (
          <button
            key={seg}
            onClick={() => selectSegment(seg)}
            disabled={toggling || (seg === 'delegate' && !canManageLists)}
            style={{
              position: 'relative', zIndex: 1, flex: 1, padding: '8px 4px', border: 'none',
              background: 'transparent', fontSize: 12, fontWeight: signal === seg ? 700 : 500,
              color: signal === seg ? '#1A1A2E' : '#9CA3AF',
              cursor: (toggling || (seg === 'delegate' && !canManageLists)) ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              opacity: (toggling || (seg === 'delegate' && !canManageLists)) ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: 13 }}>{REFERRAL_SIGNAL_DOT[seg]}</span>
            <span>{SEGMENT_LABEL[seg]}</span>
          </button>
        ))}
      </div>
      {toggleError && <div style={{ fontSize: 11, color: '#B00020' }}>更新に失敗しました</div>}

      {/* 軽微指摘: allowlist外プロは🟡(代理リスト)が実行不能なため、誘導文の代わりにこちらを表示 */}
      {!canManageLists && signal !== 'delegate' && (
        <div style={{ fontSize: 11, color: '#9CA3AF' }}>代理リスト機能は順次開放中です</div>
      )}

      {/* §2-2改訂: 🟡を選ぼうとしたが有効な代理リストが無い/未選択の場合の誘導UI */}
      {canManageLists && yellowSetupMode && (
        <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!listsLoaded ? (
            <span>読み込み中...</span>
          ) : validLists.length === 0 ? (
            <span>
              代理リストを選ぶと🟡になります。紹介リストを作成し、掲載する先生に承諾（受付中）してもらうと選べるようになります。
            </span>
          ) : (
            <>
              <span>代理リストを選ぶと🟡になります</span>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) commitStatus('closed', e.target.value)
                }}
                disabled={toggling}
                style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12, color: '#1A1A2E' }}
              >
                <option value="">代理リストを選択</option>
                {validLists.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </>
          )}
          <button
            onClick={() => setYellowSetupMode(false)}
            style={{ alignSelf: 'flex-start', fontSize: 11, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            キャンセル
          </button>
        </div>
      )}

      {/* §2-2改訂: delegateListIdは設定済みだが有効な代理メンバーがいないため🔴になっている場合、
          本人が原因を理解できるよう説明を1行添える(空約束の防止・CEO決定) */}
      {!yellowSetupMode && signal === 'closed' && listsLoaded && delegateListId && !hasValidDelegate && (
        <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.6 }}>
          代理リストが現在有効でないため、停止中と表示されます（承諾済みで受付中のメンバーがいない、またはリストが共有可能な状態ではありません）
        </div>
      )}

      {/* 🟡確定済み: 現在の代理リストの変更UI */}
      {!yellowSetupMode && signal === 'delegate' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>案内先: {selectedDelegateList?.title}</span>
          {validLists.length > 1 && (
            <select
              value={delegateListId || ''}
              onChange={(e) => {
                if (e.target.value) commitStatus('closed', e.target.value)
              }}
              disabled={toggling}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12, color: '#1A1A2E' }}
            >
              {validLists.map((l) => (
                <option key={l.id} value={l.id}>{l.title}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* 受付中のときのみ条件メモを表示・編集できる。§2-2: 既定は表示モード、
          タップで編集モードに入り保存ボタンで確定して表示モードへ戻る。 */}
      {!yellowSetupMode && signal === 'open' && (
        <div>
          {noteEditing ? (
            <div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                placeholder="条件メモ（例: めまい・ふらつきのケースのみ／土曜のみ対応可）"
                autoFocus
                style={{
                  width: '100%', minHeight: 50, padding: '8px 10px', borderRadius: 8,
                  border: '1px solid #E5E7EB', fontSize: 12, boxSizing: 'border-box' as const,
                  resize: 'vertical' as const,
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button
                  onClick={saveNote}
                  disabled={savingNote}
                  style={{
                    fontSize: 12, padding: '6px 14px', borderRadius: 8, border: 'none',
                    background: '#1A1A2E', color: '#fff', cursor: savingNote ? 'default' : 'pointer',
                    opacity: savingNote ? 0.6 : 1,
                  }}
                >
                  {savingNote ? '保存中...' : '保存する'}
                </button>
                <button
                  onClick={cancelNoteEdit}
                  disabled={savingNote}
                  style={{
                    fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1px solid #E5E7EB',
                    background: '#fff', color: '#6B7280', cursor: savingNote ? 'default' : 'pointer',
                  }}
                >
                  キャンセル
                </button>
              </div>
              {noteError && <div style={{ fontSize: 11, color: '#B00020', marginTop: 4 }}>保存に失敗しました</div>}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
              {savedNote ? (
                <button
                  onClick={() => setNoteEditing(true)}
                  style={{
                    fontSize: 12, color: '#1A1A2E', background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer', textAlign: 'left' as const,
                  }}
                >
                  {savedNote}
                </button>
              ) : (
                <button
                  onClick={() => setNoteEditing(true)}
                  style={{
                    fontSize: 12, color: '#6B7280', background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer', textDecoration: 'underline',
                  }}
                >
                  条件を追記する
                </button>
              )}
              {justSaved && <span style={{ fontSize: 11, color: '#2E7D32' }}>保存しました</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
