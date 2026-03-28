'use client'

import { useState, useEffect } from 'react'

interface XDayCountdownProps {
  proofVoteCount: number
  topStrengthLabel: string | null
  topStrengthVotes: number
}

const X_DAY_MS = new Date('2026-06-30T00:00:00+09:00').getTime()

export default function XDayCountdown({ proofVoteCount, topStrengthLabel, topStrengthVotes }: XDayCountdownProps) {
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, mins: 0, secs: 0 })
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, X_DAY_MS - Date.now())
      if (diff === 0) {
        setExpired(true)
        return
      }
      setCountdown({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        mins: Math.floor((diff % 3600000) / 60000),
        secs: Math.floor((diff % 60000) / 1000),
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  if (expired) return null

  const hasProof = proofVoteCount > 0 && topStrengthLabel !== null

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div style={{
      border: '1px solid #C4A35A',
      background: '#1A1A2E',
      borderRadius: 12,
      padding: '24px 20px',
      marginBottom: 24,
      textAlign: 'center',
    }}>
      {/* タイトル */}
      <div style={{
        color: '#FAFAF7',
        fontSize: 14,
        fontWeight: 500,
        marginBottom: 16,
      }}>
        35,000人への公開まで
      </div>

      {/* リアルタイムカウントダウン */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        marginBottom: 20,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {/* DAYS */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ color: '#C4A35A', fontSize: 36, fontWeight: 500, lineHeight: 1 }}>
            {countdown.days}
          </span>
          <span style={{ color: 'rgba(250,250,247,0.4)', fontSize: 10, marginTop: 2 }}>DAYS</span>
        </div>
        {/* colon */}
        <span style={{ color: 'rgba(250,250,247,0.3)', fontSize: 28, fontWeight: 400, marginBottom: 12 }}>:</span>
        {/* HOURS */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ color: '#FAFAF7', fontSize: 36, fontWeight: 500, lineHeight: 1 }}>
            {pad(countdown.hours)}
          </span>
          <span style={{ color: 'rgba(250,250,247,0.4)', fontSize: 10, marginTop: 2 }}>HOURS</span>
        </div>
        {/* colon */}
        <span style={{ color: 'rgba(250,250,247,0.3)', fontSize: 28, fontWeight: 400, marginBottom: 12 }}>:</span>
        {/* MIN */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ color: '#FAFAF7', fontSize: 36, fontWeight: 500, lineHeight: 1 }}>
            {pad(countdown.mins)}
          </span>
          <span style={{ color: 'rgba(250,250,247,0.4)', fontSize: 10, marginTop: 2 }}>MIN</span>
        </div>
        {/* colon */}
        <span style={{ color: 'rgba(250,250,247,0.3)', fontSize: 28, fontWeight: 400, marginBottom: 12 }}>:</span>
        {/* SEC */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ color: '#FAFAF7', fontSize: 36, fontWeight: 500, lineHeight: 1 }}>
            {pad(countdown.secs)}
          </span>
          <span style={{ color: 'rgba(250,250,247,0.4)', fontSize: 10, marginTop: 2 }}>SEC</span>
        </div>
      </div>

      {/* 強み表示 or ゼロ状態 */}
      {hasProof ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            color: 'rgba(250,250,247,0.7)',
            fontSize: 13,
            marginBottom: 4,
          }}>
            あなたの一番の強み:
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}>
            <span style={{
              color: '#C4A35A',
              fontSize: 18,
              fontWeight: 700,
            }}>
              {topStrengthLabel}
            </span>
            <span style={{
              color: '#FAFAF7',
              fontSize: 18,
              fontWeight: 700,
            }}>
              {topStrengthVotes}票
            </span>
          </div>
        </div>
      ) : (
        <div style={{
          color: 'rgba(250,250,247,0.5)',
          fontSize: 14,
          marginBottom: 16,
          textAlign: 'center',
        }}>
          まだ強みの証明がありません
        </div>
      )}

      {/* サブコピー */}
      <div style={{
        color: 'rgba(250,250,247,0.5)',
        fontSize: 12,
      }}>
        その日の数字が、第一印象になります。
      </div>
    </div>
  )
}
