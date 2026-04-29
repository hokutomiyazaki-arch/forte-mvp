'use client'

/**
 * RewardOptinSection — 投票完了画面で「リワード/お知らせをメールで受け取る」同意を取る UI
 *
 * 配置: vote-confirmed/page.tsx の VoteConsentSection (写真同意 UI) の直下、
 *       RewardReveal の上。同意 UI が不要なケース (pro_link 等) でも常に表示する。
 *
 * 動作:
 *   - チェック → PATCH /api/votes/[id]/reward-optin で votes.reward_optin を更新
 *   - 保存成功 → 親へ onChange(true) 通知 (親が /api/deliver-reward を fire-and-forget)
 *   - 保存失敗 → checkbox を rollback
 */

import { useState } from 'react'

interface Props {
  voteId: string
  proName: string
  /** チェック状態が変わって保存成功した時に呼ばれる */
  onChange?: (optin: boolean) => void
}

export default function RewardOptinSection({ voteId, proName, onChange }: Props) {
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newChecked = e.target.checked
    setChecked(newChecked)
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/votes/${voteId}/reward-optin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ reward_optin: newChecked }),
      })

      if (!res.ok) {
        throw new Error(`save failed (${res.status})`)
      }

      onChange?.(newChecked)
    } catch (err) {
      console.error('[RewardOptinSection] save failed:', err)
      setError('保存に失敗しました。もう一度お試しください。')
      // rollback — UI を元の状態へ
      setChecked(!newChecked)
    } finally {
      setLoading(false)
    }
  }

  const labelName = proName ? `${proName}さん` : 'プロの方'

  return (
    <div
      style={{
        padding: '20px 22px',
        backgroundColor: 'rgba(196, 163, 90, 0.05)',
        border: '1px solid rgba(196, 163, 90, 0.25)',
        borderRadius: 12,
      }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          cursor: loading ? 'wait' : 'pointer',
          margin: 0,
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={loading}
          style={{
            marginTop: 3,
            width: 20,
            height: 20,
            accentColor: '#C4A35A',
            cursor: 'inherit',
            flexShrink: 0,
          }}
        />
        <div>
          <div
            style={{
              color: '#1A1A2E',
              fontSize: 15,
              fontWeight: 500,
              lineHeight: 1.55,
            }}
          >
            {labelName}や REALPROOF からの
            <br />
            リワード・お知らせ・新機能情報を
            <br />
            メールで受け取る
          </div>
          <div
            style={{
              marginTop: 6,
              color: '#666',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            (任意)
          </div>
        </div>
      </label>
      {error && (
        <p style={{ marginTop: 10, color: '#C00', fontSize: 12 }}>{error}</p>
      )}
    </div>
  )
}
