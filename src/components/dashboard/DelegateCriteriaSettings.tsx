'use client'

/**
 * §16-8 + §16-14 + §16-20（CEO決定・2026-08-06）: 代理案内の設定UI。
 *
 * §16-20: 案内先のソースは2種類。
 *   - mode='org' : 団体からの自動抽出(founder/instructor限定・強みは自動算出のため入力不要・最大4名)
 *   - mode='list': 自分の紹介リスト(共有リスト)から1つ選ぶ(全プロ利用可・最大3名=リスト自体の上限)
 * 団体を持たないプロ(orgs.length===0)には「自分のリストから」のみ表示する。
 *
 * 保存先は既存の PATCH /api/referral/accepting を拡張（新規routeを作らない・既存流儀に従う）。
 * このAPIは accepting_status が常に必須で、accepting_note を省略すると null に落とされるため
 * (既存挙動を壊さないよう)、現在の accepting_status/accepting_note を毎回そのまま同送する。
 */

import { useEffect, useState } from 'react'

interface EligibleOrg {
  organizationId: string
  organizationName: string
  role: 'founder' | 'instructor'
}

interface OwnShareableList {
  id: string
  title: string
}

interface Criteria {
  enabled: boolean
  mode?: 'org' | 'list'
  org_id?: string | null
  list_id?: string | null
  min_support_records: number | null
}

interface Props {
  orgs: EligibleOrg[]
  initialCriteria: Criteria | null
  currentAcceptingStatus: 'open' | 'closed' | 'conditional' | null
  currentAcceptingNote: string | null
  onUpdated: (criteria: Criteria) => void
}

export default function DelegateCriteriaSettings({
  orgs,
  initialCriteria,
  currentAcceptingStatus,
  currentAcceptingNote,
  onUpdated,
}: Props) {
  const hasOrgs = orgs.length > 0
  // §16-20: mode未指定(既存データ)は後方互換として'org'として扱う。団体を持たないプロは'list'固定。
  const initialMode: 'org' | 'list' = !hasOrgs ? 'list' : initialCriteria?.mode === 'list' ? 'list' : 'org'

  const [enabled, setEnabled] = useState(!!initialCriteria?.enabled)
  const [mode, setMode] = useState<'org' | 'list'>(initialMode)
  const [orgId, setOrgId] = useState<string>(initialCriteria?.org_id || orgs[0]?.organizationId || '')
  const [listId, setListId] = useState<string>(initialCriteria?.list_id || '')
  const [minSupport, setMinSupport] = useState<string>(
    typeof initialCriteria?.min_support_records === 'number' ? String(initialCriteria.min_support_records) : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [saved, setSaved] = useState(false)

  // §16-20: 「自分のリストから」の選択肢用に自分の共有(private以外)リストを取得する
  // (AcceptingStatusWidget.tsxの既存の同種フェッチパターンを踏襲)。
  const [ownLists, setOwnLists] = useState<OwnShareableList[]>([])
  const [ownListsLoaded, setOwnListsLoaded] = useState(false)
  useEffect(() => {
    fetch('/api/referral/lists', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.lists) {
          const shareable = (data.lists as Array<{ id: string; title: string; visibility: string }>)
            .filter((l) => l.visibility !== 'private')
            .map((l) => ({ id: l.id, title: l.title }))
          setOwnLists(shareable)
        }
      })
      .catch(() => {})
      .finally(() => setOwnListsLoaded(true))
  }, [])

  if (!hasOrgs && ownLists.length === 0 && ownListsLoaded && !enabled) {
    // 団体も共有リストも無いプロには選ぶものが無いため、UI自体を出さない(空約束の防止)
    return null
  }

  async function save(
    nextEnabled: boolean,
    nextMode: 'org' | 'list',
    nextOrgId: string,
    nextListId: string,
    nextMinSupport: string
  ) {
    setSaving(true)
    setError(false)
    setSaved(false)
    try {
      const parsedMin = nextMinSupport.trim() ? Math.max(0, Math.floor(Number(nextMinSupport))) : null
      const criteria: Criteria = {
        enabled: nextEnabled,
        mode: nextMode,
        org_id: nextMode === 'org' ? nextOrgId || null : null,
        list_id: nextMode === 'list' ? nextListId || null : null,
        // §16-20: min_support_recordsはmode='list'では適用しない(本人が名指しで選んでいるため)
        min_support_records: nextMode === 'org' && Number.isFinite(parsedMin as number) ? parsedMin : null,
      }
      const res = await fetch('/api/referral/accepting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          accepting_status: currentAcceptingStatus ?? 'open',
          accepting_note: currentAcceptingNote,
          delegate_criteria: criteria,
        }),
      })
      if (res.ok) {
        onUpdated(criteria)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  function handleToggle(checked: boolean) {
    setEnabled(checked)
    save(checked, mode, orgId, listId, minSupport)
  }

  function handleModeChange(nextMode: 'org' | 'list') {
    setMode(nextMode)
    if (enabled) save(enabled, nextMode, orgId, listId, minSupport)
  }

  function handleOrgChange(nextOrgId: string) {
    setOrgId(nextOrgId)
    if (enabled && mode === 'org') save(enabled, mode, nextOrgId, listId, minSupport)
  }

  function handleListChange(nextListId: string) {
    setListId(nextListId)
    if (enabled && mode === 'list') save(enabled, mode, orgId, nextListId, minSupport)
  }

  function handleMinSupportBlur() {
    save(enabled, mode, orgId, listId, minSupport)
  }

  return (
    <div
      style={{
        marginBottom: 16,
        padding: '12px 14px',
        borderRadius: 12,
        border: '1px solid #E5E7EB',
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={saving}
          onChange={(e) => handleToggle(e.target.checked)}
          style={{ width: 16, height: 16 }}
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1A2E' }}>代理案内をON</span>
      </div>
      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4, lineHeight: 1.6 }}>
        自分が停止中の間、あなたの公開カードに来た訪問者を、他の先生へご案内します。
      </div>

      {enabled && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {hasOrgs && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1A1A2E' }}>
                <input
                  type="radio"
                  name="delegate-mode"
                  checked={mode === 'org'}
                  disabled={saving}
                  onChange={() => handleModeChange('org')}
                />
                団体から自動で選ぶ（質問なし・実績ベースで自動選抜）
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1A1A2E' }}>
                <input
                  type="radio"
                  name="delegate-mode"
                  checked={mode === 'list'}
                  disabled={saving}
                  onChange={() => handleModeChange('list')}
                />
                自分のリストから
              </label>
            </div>
          )}

          {mode === 'org' && hasOrgs && (
            <>
              <div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>案内先の団体</div>
                <select
                  value={orgId}
                  disabled={saving}
                  onChange={(e) => handleOrgChange(e.target.value)}
                  style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12, color: '#1A1A2E', width: '100%' }}
                >
                  {orgs.map((o) => (
                    <option key={o.organizationId} value={o.organizationId}>{o.organizationName}</option>
                  ))}
                </select>
              </div>
              <div>
                {/* §16-17(CEO決定・2026-08-06): 判定は実人数(DISTINCT normalized_email)であり票数ではない。
                    ラベルも票数を連想させる表記(「◯プルーフ以上」等)を使わず実人数表記に統一する。
                    §16-20: min_support_recordsはmode='org'のときだけ表示する(mode='list'では適用しない)。 */}
                <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>◯人以上から支持されている認定者のみ表示（任意）</div>
                <input
                  type="number"
                  min={0}
                  value={minSupport}
                  disabled={saving}
                  onChange={(e) => setMinSupport(e.target.value)}
                  onBlur={handleMinSupportBlur}
                  placeholder="未設定"
                  style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12, color: '#1A1A2E', width: 120 }}
                />
              </div>
            </>
          )}

          {mode === 'list' && (
            <div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>案内先のリスト</div>
              {!ownListsLoaded ? (
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>読み込み中...</span>
              ) : ownLists.length === 0 ? (
                <span style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.6 }}>
                  紹介リストを作成し、掲載する先生に承諾（受付中）してもらうと選べるようになります。
                </span>
              ) : (
                <select
                  value={listId}
                  disabled={saving}
                  onChange={(e) => handleListChange(e.target.value)}
                  style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12, color: '#1A1A2E', width: '100%' }}
                >
                  <option value="">選択してください</option>
                  {ownLists.map((l) => (
                    <option key={l.id} value={l.id}>{l.title}</option>
                  ))}
                </select>
              )}
              {/* §16-20: このリスト自体のON/OFFはReferralTabの各リストカードの
                  「代理案内に使う」チェックボックスからも変更できる(同じdelegate_criteriaを操作)。 */}
            </div>
          )}
        </div>
      )}

      {saved && <div style={{ fontSize: 11, color: '#2E7D32', marginTop: 6 }}>保存しました</div>}
      {error && <div style={{ fontSize: 11, color: '#B00020', marginTop: 6 }}>保存に失敗しました</div>}
    </div>
  )
}
