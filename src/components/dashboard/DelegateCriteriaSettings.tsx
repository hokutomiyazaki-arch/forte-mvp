'use client'

/**
 * §16-8 + §16-14（CEO決定・2026-08-06）: 代理案内の設定UI。
 *
 * 強みは自動算出のため入力不要（§16-14）。残る設定は3つのみ:
 *   「代理案内をON」「団体の選択」「実績下限」
 * founder(団体オーナー)/instructor限定で表示する(呼び出し元がorgs.length===0でこのUI自体を隠す)。
 *
 * 保存先は既存の PATCH /api/referral/accepting を拡張（新規routeを作らない・既存流儀に従う）。
 * このAPIは accepting_status が常に必須で、accepting_note を省略すると null に落とされるため
 * (既存挙動を壊さないよう)、現在の accepting_status/accepting_note を毎回そのまま同送する。
 */

import { useState } from 'react'

interface EligibleOrg {
  organizationId: string
  organizationName: string
  role: 'founder' | 'instructor'
}

interface Criteria {
  enabled: boolean
  org_id: string | null
  min_support_records: number | null
}

interface Props {
  orgs: EligibleOrg[]
  initialCriteria: Criteria | null
  currentAcceptingStatus: 'open' | 'closed' | null
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
  const [enabled, setEnabled] = useState(!!initialCriteria?.enabled)
  const [orgId, setOrgId] = useState<string>(initialCriteria?.org_id || orgs[0]?.organizationId || '')
  const [minSupport, setMinSupport] = useState<string>(
    typeof initialCriteria?.min_support_records === 'number' ? String(initialCriteria.min_support_records) : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [saved, setSaved] = useState(false)

  if (orgs.length === 0) return null

  async function save(nextEnabled: boolean, nextOrgId: string, nextMinSupport: string) {
    setSaving(true)
    setError(false)
    setSaved(false)
    try {
      const parsedMin = nextMinSupport.trim() ? Math.max(0, Math.floor(Number(nextMinSupport))) : null
      const criteria: Criteria = {
        enabled: nextEnabled,
        org_id: nextEnabled ? nextOrgId || null : nextOrgId || null,
        min_support_records: Number.isFinite(parsedMin as number) ? parsedMin : null,
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
    save(checked, orgId, minSupport)
  }

  function handleOrgChange(nextOrgId: string) {
    setOrgId(nextOrgId)
    if (enabled) save(enabled, nextOrgId, minSupport)
  }

  function handleMinSupportBlur() {
    save(enabled, orgId, minSupport)
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
        自分が停止中の間、あなたの公開カードに来た訪問者を、選んだ団体の受付中の認定者へ自動でご案内します（質問なし・実績ベースで自動選抜）。
      </div>

      {enabled && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
            <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>実績下限（任意・案内する認定者の最低支持人数）</div>
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
        </div>
      )}

      {saved && <div style={{ fontSize: 11, color: '#2E7D32', marginTop: 6 }}>保存しました</div>}
      {error && <div style={{ fontSize: 11, color: '#B00020', marginTop: 6 }}>保存に失敗しました</div>}
    </div>
  )
}
