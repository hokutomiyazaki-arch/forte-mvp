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

import { useEffect, useState } from 'react'
import {
  computeReferralSignal,
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
  // 移動(2026-08-06・CEO指示): 条件メモの編集はサービス・案内タブへ移した。ここでは保存済みの
  // 値(savedNote)のみ保持し、accepting_status切替時にPATCHへ載せて既存メモを消さないようにする。
  const [savedNote, setSavedNote] = useState(initialAcceptingNote || '')
  const [delegateListId, setDelegateListId] = useState<string | null>(initialDelegateListId || null)
  const [toggling, setToggling] = useState(false)
  const [lists, setLists] = useState<OwnList[]>([])
  const [listsLoaded, setListsLoaded] = useState(false)
  // レビュー指摘: 保存失敗時に一言のエラーメッセージを表示する(既存のインライン表示流儀に合わせる)
  const [toggleError, setToggleError] = useState(false)
  // 🟡を選ぼうとしたが有効な代理リストが未選択/存在しない場合、確定させず選択UIを開く
  const [yellowSetupMode, setYellowSetupMode] = useState(false)

  // 移動(2026-08-06・CEO指示): 「紹介からの予約は受け付けない」の操作先が紹介タブ側へ移った
  // ことで、accepting_status がこのウィジェットの外(親のsetPro経由)から変わりうる。
  // このコンポーネントはマウント時のみinitialAcceptingStatusをuseStateの初期値に使うため、
  // 外部からの変化を追従させるための同期(依存はプリミティブのみ)。
  useEffect(() => {
    setStatus(initialAcceptingStatus)
  }, [initialAcceptingStatus])

  // 移動(2026-08-06・CEO指示): 条件メモの編集はサービス・案内タブ(BusinessInfoTab)へ移した。
  // このウィジェットはメモを保存済み値の読み取り専用表示のみ行うため、親(dashboard/page.tsx)側で
  // BusinessInfoTab経由の保存後にsetProが更新されたら追従させる(依存はプリミティブのみ)。
  useEffect(() => {
    setSavedNote(initialAcceptingNote || '')
  }, [initialAcceptingNote])

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, maxWidth: 240 }}>
      {/* §CEO指摘対応(2026-08-06): 従来の角丸ピル(🟢受付中)は「バッジ」に見えて押せると分からない
          という指摘のため、iOS風のトグルスイッチ(丸いつまみが左右にスライド)へ変更。
          ON(緑・右)=受付中、OFF(グレー/赤・左)=停止中。ラベルは横に添える。停止中で有効な代理案内が
          ある間は「停止中（案内中）」と表示し、4色目のインジケータは作らない(OFF表現のまま)。
          タップ挙動(停止のみ確認・再開は即時)はhandleCompactToggleのまま変更しない。 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={handleCompactToggle}
          disabled={toggling}
          role="switch"
          aria-checked={effectiveStatus === 'open'}
          aria-label="紹介の受付状態"
          style={{
            position: 'relative', width: 40, height: 22, borderRadius: 999,
            border: 'none', padding: 0, flexShrink: 0,
            background: effectiveStatus === 'open' ? '#06C755' : (signal === 'delegate' ? '#D9A400' : '#D1D5DB'),
            cursor: toggling ? 'default' : 'pointer',
            opacity: toggling ? 0.6 : 1,
            transition: 'background-color 0.15s ease',
          }}
        >
          <span
            style={{
              position: 'absolute', top: 2, left: effectiveStatus === 'open' ? 20 : 2,
              width: 18, height: 18, borderRadius: '50%', background: '#fff',
              boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
              transition: 'left 0.15s ease',
            }}
          />
        </button>
        <span
          style={{
            fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' as const,
            color: effectiveStatus === 'open' ? '#1B5E20' : '#B00020',
          }}
        >
          {effectiveStatus === 'open' ? SEGMENT_LABEL.open : (signal === 'delegate' ? '停止中（案内中）' : SEGMENT_LABEL.closed)}
        </span>
      </div>
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

      {/* §CEO指摘対応(2026-08-06): 条件メモの編集UI(テキストエリア＋「条件を追記する」リンク)は
          ダッシュボード上部から撤去し、サービス・案内タブ(BusinessInfoTab)へ移動した。
          ここには編集導線を置かず、保存済みのメモがある場合のみ1行の読み取り専用表示だけ残す
          (受付中/紹介のみ停止のときに表示。1行を超えないようellipsisで省略)。 */}
      {savedNote && (signal === 'open' || status === 'conditional') && (
        <div
          style={{
            fontSize: 12, color: '#6B7280', textAlign: 'right' as const,
            maxWidth: 240, width: '100%',
            whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
          }}
          title={savedNote}
        >
          {savedNote}
        </div>
      )}
    </div>
  )
}
