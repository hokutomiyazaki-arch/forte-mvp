'use client'

/**
 * §16-7改訂（2026-08-05・CEO決定）: 🟡代理リストは紹介リスト内の入れ子としては一旦撤回し、
 * §16-8で「停止中プロの公開カード」側にcriteriaベースで再設計する（置き場所を変えて復活）。
 * これに伴い、この受け入れステータスウィジェットは **操作は2値、表示は3色** に整理する。
 *
 * - スライダーは 🔴停止中 ⇔ 🟢受付中 の2値トグルのみ（🟡は選択肢から外す。
 *   §16-8のcriteriaベース設定はここでは行わず、別UIで実装する）
 *   - 🟢選択 → PATCH accepting_status='open'
 *   - 🔴選択 → PATCH accepting_status='closed'
 *     （旧実装はここでdelegate_list_idを明示的にnullへ落としていたが、スライダーと代理設定は
 *     分離する方針のため廃止した。誤操作で🟡状態のdelegate_list_idが消える事故を防ぐ。
 *     delegate_list_idの解除は§16-8の専用設定UIで行う想定）
 * - 🟡は「代理設定がONの間、自動で点灯する表示インジケータ」（選ぶものではない）。
 *   現在の点灯条件（closedかつ有効な代理リストあり）は§16-8まで現状維持し、表示ロジックは
 *   壊さない（isValidDelegate判定・computeReferralSignal・getValidDelegateListIdsは不変）。
 *   既に🟡状態のプロがこのトグルを見た時に「🔴側を押すと案内が消える」という誤解を避けるため、
 *   トグル直下に「停止中（認定者を案内中）」の補足を表示する。
 *
 * NULL（未設定）はノブ🟢位置として表示するが、PATCHは送らない
 * （fail-open。ユーザーが操作して初めて明示値を送る）。
 *
 * 代理リスト選択UI(yellowSetupMode等)はコードとしては削除せず残す（§16-8で
 * criteriaベースの別UIに作り替えるため。selectSegmentは今後'delegate'を渡されないため
 * 実質不活性）。
 *
 * 3色インジケータの導出は src/lib/referral-accepting.ts の computeReferralSignal に集約。
 */

import { useEffect, useRef, useState } from 'react'
import {
  computeReferralSignal,
  REFERRAL_SIGNAL_DOT,
  REFERRAL_SIGNAL_LABEL,
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
  // §16-18(CEO決定・2026-08-06): 'conditional'は副オプション「紹介からの予約は受け付けない」ON時の値
  initialAcceptingStatus: 'open' | 'closed' | 'conditional' | null
  initialAcceptingNote: string | null
  initialDelegateListId: string | null
  onUpdated: (status: 'open' | 'closed' | 'conditional', note: string | null, delegateListId: string | null) => void
  /** 軽微指摘: allowlist外プロ(referralEnabled=false)では代理リスト機能(🟡)がまだ実行不能なため、
   * 🟡セグメントをdisabledにし誘導文を差し替える。既存呼び出しを壊さないようオプショナル+デフォルトtrue。 */
  canManageLists?: boolean
  /** メニュー未設定プロの予約穴の閉塞(2026-08-05・CEO指示): 予約可能な有料メニューが1件でもあるか。
   * false の間、受付中(🟢)表示にメニュー登録を促すバナーを出す。既存呼び出しを壊さないようオプショナル。 */
  hasBookableMenu?: boolean
}

// §CEO指摘対応(2026-08-06): ダッシュボード見出し行への移動に伴い、2段セグメント表示を廃止し
// 現在の状態のみを示す単一ピル(タップで反転)に変更する。値の意味・遷移先(open/closed)は不変。
const SEGMENT_LABEL: Record<'closed' | 'open', string> = {
  closed: '停止中',
  open: '受付中',
}

export default function AcceptingStatusWidget({
  initialAcceptingStatus,
  initialAcceptingNote,
  initialDelegateListId,
  onUpdated,
  canManageLists = true,
  hasBookableMenu = true,
}: Props) {
  // 先行テスト第3弾: DB上のNULLはそのまま保持するが、表示・分岐は effectiveStatus (下記) で
  // 'open' に丸める(PATCH送信時のみ明示値を送るため、stateそのものはnull保持で問題ない)。
  // §16-18: 'conditional'(紹介のみ停止)もスライダー上は'open'側として丸める(メインの2値トグル自体は
  // 変更しない・下の副オプションで区別する)。
  const [status, setStatus] = useState<'open' | 'closed' | 'conditional' | null>(initialAcceptingStatus)
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

  // 移動(2026-08-06・CEO指示): 「紹介からの予約は受け付けない」の操作先が紹介タブ側へ移った
  // ことで、accepting_status がこのウィジェットの外(親のsetPro経由)から変わりうる。
  // このコンポーネントはマウント時のみinitialAcceptingStatusをuseStateの初期値に使うため、
  // 外部からの変化を追従させるための同期(依存はプリミティブのみ)。
  useEffect(() => {
    setStatus(initialAcceptingStatus)
  }, [initialAcceptingStatus])

  // 先行テスト第3弾: NULL(未設定)は'open'として扱う(fail-open)。UI分岐は全てこの値を使う。
  // §16-18: 'conditional'もスライダーの見た目は'open'側(メインの2値トグルは不変)。
  const effectiveStatus: 'open' | 'closed' = status === 'closed' ? 'closed' : 'open'

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
  async function commitStatus(next: 'open' | 'closed' | 'conditional', delegateOpt?: string | null) {
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

  // §16-7改訂: 2値スライダーの選択ハンドラ。UIからは'closed'|'open'のみ渡される
  // (型はReferralSignalのまま維持し、§16-8まで'delegate'分岐のコードを残す)。
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
      // §16-7改訂: スライダーと代理設定を分離するため、ここではdelegate_list_idに触れない
      // (旧実装はnullで明示的にクリアしていたが、既に🟡状態のプロが誤って🔴を押すと
      // delegate_list_idが消える事故になるため廃止。解除は§16-8の専用設定UIで行う)
      setYellowSetupMode(false)
      await commitStatus('closed')
      return
    }
    // target === 'delegate'（🟡）: §16-7改訂によりUIから選択肢自体を外したため、
    // このUIからは到達しない（selectSegmentへは'closed'|'open'のみが渡される）。
    // §16-8でcriteriaベースの別設定UIに作り替えるまでコードは残す。
    if (!canManageLists) return
    if (delegateListId && validLists.some((l) => l.id === delegateListId)) {
      // 既に有効な代理リストが選択済み → そのままclosedにする
      await commitStatus('closed', delegateListId)
    } else {
      // 有効な代理リストが無い/未選択 → 確定させず選択UIへ誘導する
      setYellowSetupMode(true)
    }
  }

  // §CEO指摘対応(2026-08-06): ピル1個をタップで反転させる。受付停止(open→closed)は
  // 他院・紹介ネットワークからの見え方が変わる操作のため確認を挟む。再開(closed→open)は即時。
  async function handleCompactToggle() {
    if (toggling) return
    const target: 'open' | 'closed' = effectiveStatus === 'open' ? 'closed' : 'open'
    if (target === 'closed') {
      const ok = window.confirm('紹介の受付を停止しますか？（条件メモ・案内先の設定はそのまま保持されます）')
      if (!ok) return
    }
    await selectSegment(target)
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
      // §16-18: effectiveStatusは表示用に'conditional'を'open'へ丸めた値のため、PATCHには
      // 実際のstatus(conditionalならconditionalのまま)を送る。丸めた値を送ると
      // 条件メモの保存だけで「紹介からの予約は受け付けない」が解除されてしまう事故になる。
      const statusToSend = status ?? 'open'
      const res = await fetch('/api/referral/accepting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ accepting_status: statusToSend, accepting_note: note }),
      })
      if (res.ok) {
        setSavedNote(note)
        onUpdated(statusToSend, note || null, delegateListId)
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, maxWidth: 240 }}>
      {/* §CEO指摘対応(2026-08-06): ダッシュボード見出し行の右横に収まる単一ピル。
          緑(受付中)/赤(停止中)のどちらか一方だけを表示し、タップで反転する。
          停止中の間のドットは実際のシグナル(🔴/🟡)を反映する(§16-7改訂の意図を維持)。 */}
      <button
        onClick={handleCompactToggle}
        disabled={toggling}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' as const,
          padding: '4px 10px', borderRadius: 999, border: 'none',
          background: effectiveStatus === 'open' ? '#E8F5E9' : '#FDECEA',
          color: effectiveStatus === 'open' ? '#1B5E20' : '#B00020',
          fontSize: 12, fontWeight: 700,
          cursor: toggling ? 'default' : 'pointer',
          opacity: toggling ? 0.6 : 1,
        }}
      >
        <span style={{ fontSize: 13 }}>
          {effectiveStatus === 'open' ? REFERRAL_SIGNAL_DOT.open : REFERRAL_SIGNAL_DOT[signal === 'delegate' ? 'delegate' : 'closed']}
        </span>
        <span>{SEGMENT_LABEL[effectiveStatus]}</span>
      </button>
      {toggleError && <div style={{ fontSize: 11, color: '#B00020' }}>更新に失敗しました</div>}

      {/* 移動(2026-08-06・CEO指示): 「紹介からの予約は受け付けない」チェックボックス(旧§16-18)は
          ダッシュボード最上部から紹介タブ「紹介を受ける」サブタブの先頭へ移動した(dashboard/page.tsx)。
          ここには残さない(ダッシュボード最上部はメイントグル+条件メモの2要素のみに戻す)。 */}

      {/* §16-7改訂: 現在🟡(closed+有効な代理あり)状態のとき、🔴側を押すと案内(delegate_list_id)が
          消えると誤解されないよう補足する。commitStatusはdelegate_list_idに触れない実装のため、
          実際には🔴を押しても案内は消えない(誤操作事故は起きない)が、状態を正しく伝える。 */}
      {signal === 'delegate' && (
        <div style={{ fontSize: 11, color: '#8A6D00', lineHeight: 1.6, textAlign: 'right' as const }}>
          {REFERRAL_SIGNAL_LABEL.delegate}
          {selectedDelegateList ? `（案内先: ${selectedDelegateList.title}）` : ''}
        </div>
      )}

      {/* §2-2改訂: 🟡を選ぼうとしたが有効な代理リストが無い/未選択の場合の誘導UI
          §16-7改訂: selectSegmentへ'delegate'が渡らなくなったためyellowSetupModeは常にfalseで
          到達しない。§16-8のcriteriaベース再設計まではコードのみ残す(削除しない)。 */}
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
          本人が原因を理解できるよう説明を1行添える(空約束の防止・CEO決定)。
          §16-7改訂: UI表示から内部用語「代理リスト」を除去した文言に更新。
          §16-7改訂: 現在の代理リストの変更UI(select)はスライダーから分離する方針のため削除。
          delegate_list_idの変更は§16-8の専用設定UIで行う想定(このcaptionと上部の案内先表示で
          読み取り専用の状態確認のみ提供する)。 */}
      {!yellowSetupMode && signal === 'closed' && listsLoaded && delegateListId && !hasValidDelegate && (
        <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.6 }}>
          認定者への案内が現在無効なため、停止中と表示されます（承諾済みで受付中のメンバーがいない、またはリストが共有可能な状態ではありません）
        </div>
      )}

      {/* メニュー未設定プロの予約穴の閉塞(2026-08-05・CEO指示): 受付中(🟢)だが予約可能な
          有料メニューが1件も無い間は、予約リクエスト自体が作れない(閲覧側もボタン非表示)ため
          サービス設定への誘導を出す。 */}
      {!yellowSetupMode && signal === 'open' && !hasBookableMenu && (
        <div
          style={{
            fontSize: 11,
            color: '#8A6D00',
            background: '#FFF8E1',
            border: '1px solid #F5E3A3',
            borderRadius: 8,
            padding: '8px 10px',
            lineHeight: 1.6,
          }}
        >
          紹介予約を受け付けるには、サービス設定でメニューと料金を登録してください。
          {' '}
          <a href="/dashboard?tab=business-info" style={{ color: '#8A6D00', fontWeight: 700, textDecoration: 'underline' }}>
            サービス設定へ →
          </a>
        </div>
      )}

      {/* 受付中のときのみ条件メモを表示・編集できる。§2-2: 既定は表示モード、
          タップで編集モードに入り保存ボタンで確定して表示モードへ戻る。
          バグ修正(2026-08-06・CEO指摘): status==='conditional'(紹介のみ停止)は
          computeReferralSignal で 'closed'/'delegate' に畳まれ signal==='open' にならないため、
          このブロック自体(表示・編集UI)ごと消えていた。conditionalのときこそ「直接のご相談は
          受け付けています」等を書きたい場面のため、status==='conditional' も表示対象に含める。
          保存済みのaccepting_noteはDB側で保持されたままだった(消えていたのは表示条件のみ)。 */}
      {!yellowSetupMode && (signal === 'open' || status === 'conditional') && (
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' as const, minWidth: 0, width: '100%' }}>
              {savedNote ? (
                <button
                  onClick={() => setNoteEditing(true)}
                  style={{
                    fontSize: 12, color: '#1A1A2E', background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer', textAlign: 'right' as const, display: 'block', width: '100%',
                    whiteSpace: 'normal' as const, wordBreak: 'break-word' as const,
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
